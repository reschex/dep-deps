/**
 * Analysis orchestrator — coordinates ports to produce analysis results.
 *
 * This module has NO VS Code dependency. All infrastructure access goes through
 * the port interfaces (DocumentProvider, SymbolProvider, etc.), making it fully
 * testable with fakes.
 */

import { computeSymbolMetrics, type SymbolInput, type SymbolMetrics } from "../../core/analyze";
import { applyChurn } from "../../core/churn";
import { coverageFractionForSymbol } from "../../core/coverageMap";
import { rollupFileRisk, type SymbolRiskRow } from "../../core/rollup";
import type { RankOptions, CallEdge } from "../../core/rank";
import type {
  DocumentProvider,
  SymbolProvider,
  CallGraphProvider,
  CoverageProvider,
  ChurnProvider,
  Logger,
  FunctionSymbolInfo,
  DocumentInfo,
} from "../../core/ports";
import type { CcProviderRegistry } from "../../core/ccRegistry";
import type { UriFilter } from "../../core/gitignoreFilter";
import type { DdpConfiguration, AnalysisScope } from "./configuration";
import { matchesExcludePattern } from "../../core/excludeFilter";
import { estimateCyclomaticComplexity } from "../../language/estimateCc";
import type { IntegrationReport, IntegrationEntry } from "../../core/integrationReport";


const nullChurnProvider: ChurnProvider = {
  getChurnCounts: () => Promise.resolve(new Map()),
};

export type AnalysisResult = {
  readonly symbols: SymbolMetrics[];
  readonly fileRollup: Map<string, number>;
  readonly edges: ReadonlyArray<CallEdge>;
  readonly edgesCount: number;
  /** Which data sources were used.  Optional for backward-compat with test fixtures. */
  readonly integrations?: IntegrationReport;
};

export type AnalysisContext = {
  isCancelled(): boolean;
};

export type OrchestratorDeps = {
  readonly documentProvider: DocumentProvider;
  readonly symbolProvider: SymbolProvider;
  readonly callGraphProvider: CallGraphProvider;
  readonly coverageProvider: CoverageProvider;
  readonly ccRegistry: CcProviderRegistry;
  readonly logger: Logger;
  readonly churnProvider?: ChurnProvider;
  readonly clock?: () => Date;
  /**
   * Optional URI-based file exclusion filter.
   * Returns `true` when a file URI should be excluded from analysis.
   *
   * Adapters compose this from gitignore rules (and, in future,
   * include/exclude globs) together with the workspace root URI.
   * The orchestrator applies it when `config.fileFilter.respectGitignore` is true.
   */
  readonly gitignoreFilter?: UriFilter;
};

/** Mutable tracker for collecting integration observations during analysis. */
type IntegrationTracker = {
  /** Languages where the tool CC provider returned data. */
  readonly ccToolLanguages: Set<string>;
  /** Languages where CC fell back to regex estimation. */
  readonly ccEstimatedLanguages: Set<string>;
  /** Number of analysed files that had coverage data. */
  filesWithCoverage: number;
  /** All language IDs encountered during analysis. */
  readonly languagesSeen: Set<string>;
};

function createTracker(): IntegrationTracker {
  return {
    ccToolLanguages: new Set(),
    ccEstimatedLanguages: new Set(),
    filesWithCoverage: 0,
    languagesSeen: new Set(),
  };
}

export class AnalysisOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async analyze(config: DdpConfiguration, ctx: AnalysisContext, scope?: AnalysisScope): Promise<AnalysisResult | undefined> {
    const { callGraphProvider, coverageProvider, logger } = this.deps;
    const rootUri = scope?.rootUri;

    logger.info(`Analysis started (maxFiles=${config.maxFiles}, rootUri=${rootUri ?? "(workspace)"})`);

    // 1. Load coverage data
    await coverageProvider.loadCoverage();
    if (ctx.isCancelled()) {
      return undefined;
    }

    // 2. Build call graph (scope-aware: only expands roots under rootUri)
    const logDebug = config.debugEnabled ? (msg: string) => logger.debug?.(msg) : undefined;
    logDebug?.(`Building call graph (maxFiles=${config.maxFiles}, rootUri=${rootUri ?? "(workspace)"})`);
    const edges = await callGraphProvider.collectCallEdges(config.maxFiles, rootUri);
    logDebug?.(`Call graph: ${edges.length} edge(s)`);
    if (ctx.isCancelled()) {
      return undefined;
    }

    // 3. Discover source files and extract symbols
    const fileUris = await this.discoverSourceFiles(config, rootUri);
    logDebug?.(`Discovered ${fileUris.length} source file(s) for analysis`);
    for (const uri of fileUris) {
      logDebug?.(`  file: ${uri}`);
    }
    const tracker = createTracker();
    const symbolInputs = await this.collectAllSymbolInputs(fileUris, config, ctx, tracker);

    // 4. Compute metrics
    const rankOpts: Partial<RankOptions> = {
      maxIterations: config.rank.maxIterations,
      epsilon: config.rank.epsilon,
    };
    const rawSymbols = computeSymbolMetrics(edges, symbolInputs, rankOpts);

    const symbols = await this.applyChurnIfEnabled(rawSymbols, config);

    const rows: SymbolRiskRow[] = symbols.map((s) => ({ symbolId: s.id, uri: s.uri, f: s.fPrime }));
    const fileRollup = rollupFileRisk(rows, config.fileRollup);

    const integrations = buildIntegrationReport(tracker, config, edges.length);

    logger.info(`Analysis complete: ${symbols.length} symbols, ${edges.length} edges`);
    return { symbols, fileRollup, edges, edgesCount: edges.length, integrations };
  }

  private async applyChurnIfEnabled(
    symbols: SymbolMetrics[],
    config: DdpConfiguration
  ): Promise<SymbolMetrics[]> {
    if (!config.churn.enabled) {
      return symbols;
    }
    const churnProvider = this.deps.churnProvider ?? nullChurnProvider;
    const now = this.deps.clock?.() ?? new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - config.churn.lookbackDays);
    try {
      const counts = await churnProvider.getChurnCounts(since);
      return applyChurn(symbols, counts);
    } catch (err) {
      this.deps.logger.warn(`churn data unavailable, skipping: ${err instanceof Error ? err.message : String(err)}`);
      return symbols;
    }
  }

  private async discoverSourceFiles(config: DdpConfiguration, rootUri?: string): Promise<string[]> {
    let uris = await this.deps.documentProvider.findSourceFiles(config.maxFiles, rootUri);
    const gitignoreFilter = this.deps.gitignoreFilter;
    if (config.fileFilter.respectGitignore && gitignoreFilter) {
      uris = uris.filter((u) => !gitignoreFilter(u));
    }
    const { excludePatterns } = config.fileFilter;
    if (excludePatterns.length > 0) {
      uris = uris.filter((u) => !matchesExcludePattern(u, excludePatterns, { nocase: true }));
    }
    return uris;
  }

  private async collectAllSymbolInputs(
    fileUris: string[],
    config: DdpConfiguration,
    ctx: AnalysisContext,
    tracker: IntegrationTracker,
  ): Promise<SymbolInput[]> {
    const result: SymbolInput[] = [];
    // Sequential: allows cancellation between files.
    for (const uri of fileUris) {
      if (ctx.isCancelled()) {
        break;
      }
      const inputs = await this.collectFileSymbolInputs(uri, config, tracker);
      result.push(...inputs);
    }
    return result;
  }

  private async collectFileSymbolInputs(
    uri: string,
    config: DdpConfiguration,
    tracker: IntegrationTracker,
  ): Promise<SymbolInput[]> {
    const { documentProvider, symbolProvider, coverageProvider, ccRegistry, logger } = this.deps;

    const doc = await documentProvider.openDocument(uri);
    if (!doc) {
      logger.warn(`Skipped: could not open ${uri}`);
      return [];
    }

    tracker.languagesSeen.add(doc.languageId);

    const functions = await symbolProvider.getFunctionSymbols(uri);
    if (config.debugEnabled) {
      logger.debug?.(`${uri}: ${functions.length} symbol(s)`);
    }
    if (!functions.length) {
      return [];
    }

    const ccProvider = ccRegistry.getForLanguage(doc.languageId);
    const ccResult = await ccProvider.computeComplexity(doc);

    // Track whether tool CC produced data for this language.
    // A tool can be registered yet return empty maps (e.g. ESLint crashed silently
    // or found no functions). In that case we classify the language as "estimated"
    // because the regex fallback ran for every symbol body — this tracks actual
    // data usage, not tool registration.
    const toolHadData = ccResult.byLine.size > 0 || ccResult.byName.size > 0;
    if (toolHadData && ccRegistry.hasToolProvider(doc.languageId)) {
      tracker.ccToolLanguages.add(doc.languageId);
    } else {
      tracker.ccEstimatedLanguages.add(doc.languageId);
    }

    const statements = coverageProvider.getStatements(uri) ?? [];
    if (statements.length > 0) {
      tracker.filesWithCoverage++;
    }

    return functions.map((fn) => {
      const body = { startLine: fn.bodyStartLine, endLine: fn.bodyEndLine };
      return {
        id: makeSymbolId(uri, fn),
        uri,
        name: fn.name,
        cc: resolveCc(fn, doc, ccResult, config),
        t: coverageFractionForSymbol(body, statements, config.coverage.fallbackT),
      };
    });
  }
}

/** Build a symbol ID from URI + selection range (matches symbolIdFromUriRange format). */
function makeSymbolId(uri: string, fn: FunctionSymbolInfo): string {
  return `${uri}#${fn.selectionStartLine}:${fn.selectionStartCharacter}`;
}

// ─── CC tool label mapping ──────────────────────────────────────────────────

const CC_TOOL_LABELS: Record<string, string> = {
  typescript: "ESLint",
  javascript: "ESLint",
  typescriptreact: "ESLint",
  javascriptreact: "ESLint",
  python: "Radon",
  java: "PMD",
};

/** Human-friendly language group label for CC reporting. */
const CC_LANG_GROUPS: Record<string, string> = {
  typescript: "TS/JS",
  javascript: "TS/JS",
  typescriptreact: "TS/JS",
  javascriptreact: "TS/JS",
  python: "Python",
  java: "Java",
};

/** Build CC entries — one per language group, tool-backed entries first. */
function buildCcEntries(tracker: IntegrationTracker): IntegrationEntry[] {
  const entries: IntegrationEntry[] = [];
  const toolGroups = new Set<string>();
  for (const lang of tracker.ccToolLanguages) {
    const group = CC_LANG_GROUPS[lang] ?? lang;
    if (!toolGroups.has(group)) {
      toolGroups.add(group);
      entries.push({ category: "CC", source: CC_TOOL_LABELS[lang] ?? "Tool", detail: group, status: "active" });
    }
  }
  const estimatedGroups = new Set<string>();
  for (const lang of tracker.ccEstimatedLanguages) {
    const group = CC_LANG_GROUPS[lang] ?? lang;
    // A group can land in both sets when some files got tool data and others
    // fell back to regex (e.g. one .ts parsed, another ESLint-failed). Tool
    // wins: skip the estimated entry so the group shows a single "active" row.
    if (!toolGroups.has(group) && !estimatedGroups.has(group)) {
      estimatedGroups.add(group);
      entries.push({
        category: "CC",
        source: "Estimated",
        detail: group,
        status: "fallback",
        tooltip: `No CC tool data for ${group}. Using regex estimation — less accurate.\n\nConfigure **ddp.cc.eslintPath** / **ddp.cc.pythonPath** / **ddp.cc.pmdPath** for tool-backed analysis.`,
        settingsKey: "ddp.cc",
      });
    }
  }
  return entries;
}

function buildCoverageEntry(tracker: IntegrationTracker): IntegrationEntry {
  const covTotal = tracker.filesWithCoverage;
  if (covTotal > 0) {
    return {
      category: "Coverage",
      source: "LCOV / JaCoCo",
      detail: `${covTotal} file${covTotal === 1 ? "" : "s"}`,
      status: "active",
      settingsKey: "ddp.coverage",
    };
  }
  return {
    category: "Coverage",
    source: "LCOV / JaCoCo",
    detail: "No coverage data found",
    status: "inactive",
    tooltip: "No coverage data found. Check **ddp.coverage.lcovGlob** / **ddp.coverage.jacocoGlob** point to your coverage report.",
    settingsKey: "ddp.coverage",
  };
}

function buildSymbolsEntry(tracker: IntegrationTracker): IntegrationEntry {
  const langs = [...tracker.languagesSeen].sort();
  return {
    category: "Symbols",
    source: "Native",
    detail: langs.length > 0 ? langs.join(", ") : "No files analysed",
    status: langs.length > 0 ? "active" : "inactive",
  };
}

function buildCallGraphEntry(edgeCount: number): IntegrationEntry {
  if (edgeCount > 0) {
    return { category: "Call Graph", source: "Hybrid", detail: `${edgeCount} edge${edgeCount === 1 ? "" : "s"}`, status: "active" };
  }
  return { category: "Call Graph", source: "Hybrid", detail: "No edges found", status: "inactive" };
}

function buildChurnEntry(config: DdpConfiguration): IntegrationEntry {
  if (config.churn.enabled) {
    return {
      category: "Churn",
      source: "Git",
      detail: `${config.churn.lookbackDays} day lookback`,
      status: "active",
      tooltip: `Git churn multiplier active. Looking back **${config.churn.lookbackDays} days**.\n\nG = 1 + ln(1 + commits). F′ = F × G.`,
      settingsKey: "ddp.churn",
    };
  }
  return {
    category: "Churn",
    source: "Git",
    detail: "Disabled",
    status: "inactive",
    tooltip: "Churn multiplier is disabled. Set **ddp.churn.enabled** to true to activate.\n\nNote: **.ddprc.json** overrides VS Code settings — check for a file in your workspace root.",
    settingsKey: "ddp.churn",
  };
}

/** Assemble the integration report from tracker observations and config. */
function buildIntegrationReport(
  tracker: IntegrationTracker,
  config: DdpConfiguration,
  edgeCount: number,
): IntegrationReport {
  return {
    entries: [
      ...buildCcEntries(tracker),
      buildCoverageEntry(tracker),
      buildSymbolsEntry(tracker),
      buildCallGraphEntry(edgeCount),
      buildChurnEntry(config),
    ],
  };
}

/**
 * Resolve cyclomatic complexity for a function, preferring tool-specific results
 * over the fallback estimator.
 */
function resolveCc(
  fn: FunctionSymbolInfo,
  doc: DocumentInfo,
  ccResult: { byLine: Map<number, number>; byName: Map<string, number> },
  _config: DdpConfiguration
): number {
  const line1 = fn.selectionStartLine + 1;

  // Try line-based CC (ESLint for TS/JS, PMD for Java)
  if (ccResult.byLine.size) {
    const fromLine = ccResult.byLine.get(line1);
    if (fromLine !== undefined) {
      return fromLine;
    }
  }

  // Try name-based CC (Radon for Python)
  if (ccResult.byName.size) {
    const key = `${line1}:${fn.name}`;
    const fromName = ccResult.byName.get(key);
    if (fromName !== undefined) {
      return fromName;
    }
  }

  // Fallback: regex-based estimation from source text
  const source = doc.getText(fn.bodyStartLine, fn.bodyEndLine);
  return estimateCyclomaticComplexity(source);
}
