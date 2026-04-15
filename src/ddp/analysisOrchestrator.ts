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
    const { documentProvider, symbolProvider, callGraphProvider, coverageProvider, ccRegistry, logger } = this.deps;
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

    // 3. Discover source files (scope-aware), with safety-net filter
    const rawUris = await documentProvider.findSourceFiles(MAX_FILES, rootUri);
    const fileUris = config.excludeTests ? rawUris.filter((u) => !isTestFileUri(u)) : rawUris;

    // 4. Extract symbols and compute CC per document
    const rankOpts: Partial<RankOptions> = {
      maxIterations: config.rank.maxIterations,
      epsilon: config.rank.epsilon,
    };
    const symbolInputs: SymbolInput[] = [];

    for (const uri of fileUris) {
      if (ctx.isCancelled()) {
        break;
      }

      const doc = await documentProvider.openDocument(uri);
      if (!doc) {
        logger.warn(`Skipped: could not open ${uri}`);
        continue;
      }

      const functions = await symbolProvider.getFunctionSymbols(uri);
      if (!functions.length) {
        continue;
      }

      // Get language-specific CC
      const ccProvider = ccRegistry.getForLanguage(doc.languageId);
      const ccResult = await ccProvider.computeComplexity(doc);

      // Get coverage for this file
      const statements = coverageProvider.getStatements(uri) ?? [];

      for (const fn of functions) {
        const symbolId = makeSymbolId(uri, fn);
        const body = { startLine: fn.bodyStartLine, endLine: fn.bodyEndLine };
        const t = coverageFractionForSymbol(body, statements, config.coverage.fallbackT);
        const cc = resolveCc(fn, doc, ccResult, config);

        symbolInputs.push({ id: symbolId, uri, name: fn.name, cc, t });
      }
    }

    // 5. Compute metrics
    const symbols = computeSymbolMetrics(edges, symbolInputs, rankOpts);
    const rows: SymbolRiskRow[] = symbols.map((s) => ({ symbolId: s.id, uri: s.uri, f: s.f }));
    const fileRollup = rollupFileRisk(rows, config.fileRollup);

    logger.info(`Analysis complete: ${symbols.length} symbols, ${edges.length} edges`);
    return { symbols, fileRollup, edgesCount: edges.length };
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
  config: DdpConfiguration
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
