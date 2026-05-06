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
import { NativeSymbolProvider } from '../../language/nativeSymbolProvider';
import { NativeCallGraphProvider } from '../../language/nativeCallGraphProvider';
import { buildCliCcRegistry } from './buildCliCcRegistry';
import { nullLogger, type CallGraphProvider, type Logger } from '../../core/ports';
import { loadGitignoreFilter, makeUriFilter, type UriFilter } from '../../core/gitignoreFilter';
import { pathToFileURL } from 'node:url';

/** Options for running CLI analysis. */
export type CliAnalysisOptions = {
  readonly rootPath: string;
  readonly lcovGlob?: string;
  readonly jacocoGlob?: string;
  readonly maxFiles?: number;
  readonly respectGitignore?: boolean;
  /** Glob patterns for files/folders to exclude from analysis. */
  readonly excludePatterns?: readonly string[];
  readonly skipCallGraph?: boolean;
  readonly debugEnabled?: boolean;
  readonly logger?: Logger;
  /** PageRank parameters (maxIterations, epsilon). */
  readonly rank?: { readonly maxIterations: number; readonly epsilon: number };
  /** Cyclomatic complexity provider configuration. */
  readonly cc?: {
    readonly useEslintForTsJs: boolean;
    readonly eslintPath: string;
    readonly pythonPath: string;
    readonly pmdPath: string;
  };
  /** File-level rollup strategy. */
  readonly fileRollup?: 'max' | 'sum';
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
    jacocoGlob = DEFAULT_CONFIGURATION.coverage.jacocoGlob,
    maxFiles = DEFAULT_CONFIGURATION.maxFiles,
    respectGitignore = DEFAULT_CONFIGURATION.fileFilter.respectGitignore,
    excludePatterns = DEFAULT_CONFIGURATION.fileFilter.excludePatterns,
    skipCallGraph = false,
    debugEnabled = DEFAULT_CONFIGURATION.debugEnabled,
    logger = nullLogger,
    rank = DEFAULT_CONFIGURATION.rank,
    cc = DEFAULT_CONFIGURATION.cc,
    fileRollup = DEFAULT_CONFIGURATION.fileRollup,
  } = options;

  const documentProvider = new NodeDocumentProvider(rootPath);
  const symbolProvider = new NativeSymbolProvider({
    pythonPath: cc.pythonPath,
  });
  const coverageProvider = new NodeCoverageProvider(rootPath, lcovGlob);
  const ccRegistry = buildCliCcRegistry({ cc }, rootPath);

  let gitignoreFilter: UriFilter | undefined;
  if (respectGitignore) {
    const rootUri = pathToFileURL(rootPath).toString();
    const rawFilter = await loadGitignoreFilter(rootPath);
    gitignoreFilter = makeUriFilter(rootUri, rawFilter);
  }

  const nullCallGraph: CallGraphProvider = { collectCallEdges: async () => [] };
  const callGraphProvider = skipCallGraph ? nullCallGraph : new NativeCallGraphProvider(rootPath);

  const orchestrator = new AnalysisOrchestrator({
    documentProvider,
    symbolProvider,
    callGraphProvider,
    coverageProvider,
    ccRegistry,
    logger,
    gitignoreFilter,
  });

  const config: DdpConfiguration = {
    ...DEFAULT_CONFIGURATION,
    maxFiles,
    coverage: {
      ...DEFAULT_CONFIGURATION.coverage,
      lcovGlob,
      jacocoGlob,
    },
    rank: {
      maxIterations: rank.maxIterations,
      epsilon: rank.epsilon,
    },
    cc: {
      useEslintForTsJs: cc.useEslintForTsJs,
      eslintPath: cc.eslintPath,
      pythonPath: cc.pythonPath,
      pmdPath: cc.pmdPath,
    },
    fileFilter: {
      ...DEFAULT_CONFIGURATION.fileFilter,
      respectGitignore,
      excludePatterns,
    },
    fileRollup,
    debugEnabled,
  };

  const ctx = { isCancelled: () => false };
  const result = await orchestrator.analyze(config, ctx);

  if (!result) {
    return { symbols: [], fileRollup: new Map(), edges: [], edgesCount: 0 };
  }

  return result;
}
