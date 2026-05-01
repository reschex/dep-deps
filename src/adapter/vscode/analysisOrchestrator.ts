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
import { isTestFileUri } from "./configuration";
import { estimateCyclomaticComplexity } from "../../language/estimateCc";


const nullChurnProvider: ChurnProvider = {
  getChurnCounts: () => Promise.resolve(new Map()),
};

export type AnalysisResult = {
  readonly symbols: SymbolMetrics[];
  readonly fileRollup: Map<string, number>;
  readonly edges: ReadonlyArray<CallEdge>;
  readonly edgesCount: number;
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
    const symbolInputs = await this.collectAllSymbolInputs(fileUris, config, ctx);

    // 4. Compute metrics
    const rankOpts: Partial<RankOptions> = {
      maxIterations: config.rank.maxIterations,
      epsilon: config.rank.epsilon,
    };
    const rawSymbols = computeSymbolMetrics(edges, symbolInputs, rankOpts);

    const symbols = await this.applyChurnIfEnabled(rawSymbols, config);

    const rows: SymbolRiskRow[] = symbols.map((s) => ({ symbolId: s.id, uri: s.uri, f: s.fPrime }));
    const fileRollup = rollupFileRisk(rows, config.fileRollup);

    logger.info(`Analysis complete: ${symbols.length} symbols, ${edges.length} edges`);
    return { symbols, fileRollup, edges, edgesCount: edges.length };
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
    if (config.excludeTests) {
      uris = uris.filter((u) => !isTestFileUri(u));
    }
    const gitignoreFilter = this.deps.gitignoreFilter;
    if (config.fileFilter.respectGitignore && gitignoreFilter) {
      uris = uris.filter((u) => !gitignoreFilter(u));
    }
    return uris;
  }

  private async collectAllSymbolInputs(
    fileUris: string[],
    config: DdpConfiguration,
    ctx: AnalysisContext
  ): Promise<SymbolInput[]> {
    const result: SymbolInput[] = [];
    // Sequential: allows cancellation between files.
    for (const uri of fileUris) {
      if (ctx.isCancelled()) {
        break;
      }
      const inputs = await this.collectFileSymbolInputs(uri, config);
      result.push(...inputs);
    }
    return result;
  }

  private async collectFileSymbolInputs(uri: string, config: DdpConfiguration): Promise<SymbolInput[]> {
    const { documentProvider, symbolProvider, coverageProvider, ccRegistry, logger } = this.deps;

    const doc = await documentProvider.openDocument(uri);
    if (!doc) {
      logger.warn(`Skipped: could not open ${uri}`);
      return [];
    }

    const functions = await symbolProvider.getFunctionSymbols(uri);
    if (config.debugEnabled) {
      logger.debug?.(`${uri}: ${functions.length} symbol(s)`);
    }
    if (!functions.length) {
      return [];
    }

    const ccProvider = ccRegistry.getForLanguage(doc.languageId);
    const ccResult = await ccProvider.computeComplexity(doc);
    const statements = coverageProvider.getStatements(uri) ?? [];

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
