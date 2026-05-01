/**
 * CLI analysis pipeline — wires CLI adapters to the shared AnalysisOrchestrator.
 *
 * Provides a single entry point for headless analysis without VS Code dependencies.
 * Reuses the same domain logic (computeSymbolMetrics, coverageMap, etc.) as the extension.
 */

import { AnalysisOrchestrator, type AnalysisResult } from '../../adapter/vscode/analysisOrchestrator';
import { DEFAULT_CONFIGURATION, type DdpConfiguration } from '../../adapter/vscode/configuration';
import { NodeDocumentProvider } from './nodeDocument';
import { NodeCoverageProvider } from './nodeCoverage';
import { NodeSymbolProvider } from '../../language/typescript/symbols';
import { CcProviderRegistry } from '../../core/ccRegistry';
import { nullLogger, type CallGraphProvider, type Logger } from '../../core/ports';
import type { CallEdge } from '../../core/rank';
import { loadGitignoreFilter, makeUriFilter, type UriFilter } from '../../core/gitignoreFilter';
import { pathToFileURL } from 'node:url';

/** Options for running CLI analysis. */
export type CliAnalysisOptions = {
  readonly rootPath: string;
  readonly lcovGlob?: string;
  readonly excludeTests?: boolean;
  readonly maxFiles?: number;
  readonly respectGitignore?: boolean;
  readonly debugEnabled?: boolean;
  readonly logger?: Logger;
};

/** Null call graph provider — returns empty edges (R=1 for all symbols). */
const nullCallGraphProvider: CallGraphProvider = {
  async collectCallEdges(): Promise<CallEdge[]> {
    return [];
  },
};

/**
 * Run DDP analysis from the CLI, returning the full AnalysisResult.
 *
 * This is the tracer bullet: file discovery → symbol extraction → coverage loading →
 * metric computation, all using Node.js adapters instead of VS Code APIs.
 */
export async function runCliAnalysis(options: CliAnalysisOptions): Promise<AnalysisResult> {
  const {
    rootPath,
    lcovGlob = DEFAULT_CONFIGURATION.coverage.lcovGlob,
    excludeTests = DEFAULT_CONFIGURATION.excludeTests,
    maxFiles = DEFAULT_CONFIGURATION.maxFiles,
    respectGitignore = DEFAULT_CONFIGURATION.fileFilter.respectGitignore,
    debugEnabled = DEFAULT_CONFIGURATION.debugEnabled,
    logger = nullLogger,
  } = options;

  const documentProvider = new NodeDocumentProvider(rootPath);
  const symbolProvider = new NodeSymbolProvider();
  const coverageProvider = new NodeCoverageProvider(rootPath, lcovGlob);
  const ccRegistry = new CcProviderRegistry();

  let gitignoreFilter: UriFilter | undefined;
  if (respectGitignore) {
    const rootUri = pathToFileURL(rootPath).toString();
    const rawFilter = await loadGitignoreFilter(rootPath);
    gitignoreFilter = makeUriFilter(rootUri, rawFilter);
  }

  const orchestrator = new AnalysisOrchestrator({
    documentProvider,
    symbolProvider,
    callGraphProvider: nullCallGraphProvider,
    coverageProvider,
    ccRegistry,
    logger,
    gitignoreFilter,
  });

  const config: DdpConfiguration = {
    ...DEFAULT_CONFIGURATION,
    maxFiles,
    excludeTests,
    coverage: {
      ...DEFAULT_CONFIGURATION.coverage,
      lcovGlob,
    },
    fileFilter: {
      ...DEFAULT_CONFIGURATION.fileFilter,
      respectGitignore,
    },
    debugEnabled,
  };

  const ctx = { isCancelled: () => false };
  const result = await orchestrator.analyze(config, ctx);

  if (!result) {
    return { symbols: [], fileRollup: new Map(), edges: [], edgesCount: 0 };
  }

  return result;
}
