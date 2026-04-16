/**
 * Analysis orchestrator — coordinates ports to produce analysis results.
 *
 * This module has NO VS Code dependency. All infrastructure access goes through
 * the port interfaces (DocumentProvider, SymbolProvider, etc.), making it fully
 * testable with fakes.
 */

import { computeSymbolMetrics, type SymbolInput, type SymbolMetrics } from "../core/analyze";
import { coverageFractionForSymbol } from "../core/coverageMap";
import { rollupFileRisk, type SymbolRiskRow } from "../core/rollup";
import type { RankOptions } from "../core/rank";
import type {
  DocumentProvider,
  SymbolProvider,
  CallGraphProvider,
  CoverageProvider,
  Logger,
  FunctionSymbolInfo,
  DocumentInfo,
} from "../core/ports";
import type { CcProviderRegistry } from "../core/ccRegistry";
import type { DdpConfiguration, AnalysisScope } from "./configuration";
import { isTestFileUri } from "./configuration";
import { estimateCyclomaticComplexity } from "../core/estimateCc";

/** Maximum files to scan — avoids overwhelming large workspaces. */
const MAX_FILES = 400;

export type AnalysisResult = {
  readonly symbols: SymbolMetrics[];
  readonly fileRollup: Map<string, number>;
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
};

export class AnalysisOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async analyze(config: DdpConfiguration, ctx: AnalysisContext, scope?: AnalysisScope): Promise<AnalysisResult | undefined> {
    const { callGraphProvider, coverageProvider, logger } = this.deps;
    const rootUri = scope?.rootUri;

    // 1. Load coverage data
    await coverageProvider.loadCoverage();
    if (ctx.isCancelled()) {
      return undefined;
    }

    // 2. Build call graph (scope-aware: only expands roots under rootUri)
    const edges = await callGraphProvider.collectCallEdges(MAX_FILES, rootUri);
    if (ctx.isCancelled()) {
      return undefined;
    }

    // 3. Discover source files and extract symbols
    const fileUris = await this.discoverSourceFiles(config, rootUri);
    const symbolInputs = await this.collectAllSymbolInputs(fileUris, config, ctx);

    // 4. Compute metrics
    const rankOpts: Partial<RankOptions> = {
      maxIterations: config.rank.maxIterations,
      epsilon: config.rank.epsilon,
    };
    const symbols = computeSymbolMetrics(edges, symbolInputs, rankOpts);
    const rows: SymbolRiskRow[] = symbols.map((s) => ({ symbolId: s.id, uri: s.uri, f: s.f }));
    const fileRollup = rollupFileRisk(rows, config.fileRollup);

    logger.info(`Analysis complete: ${symbols.length} symbols, ${edges.length} edges`);
    return { symbols, fileRollup, edgesCount: edges.length };
  }

  private async discoverSourceFiles(config: DdpConfiguration, rootUri?: string): Promise<string[]> {
    const rawUris = await this.deps.documentProvider.findSourceFiles(MAX_FILES, rootUri);
    return config.excludeTests ? rawUris.filter((u) => !isTestFileUri(u)) : rawUris;
  }

  private async collectAllSymbolInputs(
    fileUris: string[],
    config: DdpConfiguration,
    ctx: AnalysisContext
  ): Promise<SymbolInput[]> {
    const result: SymbolInput[] = [];
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
