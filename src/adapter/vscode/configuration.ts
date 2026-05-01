/**
 * Typed configuration object for DDP analysis.
 * Single source of truth for all settings — eliminates scattered getConfiguration() calls.
 */

export type CoverageConfig = {
  readonly fallbackT: number;
  readonly lcovGlob: string;
  readonly jacocoGlob: string;
};

export type RankConfig = {
  readonly maxIterations: number;
  readonly epsilon: number;
};

export type CcConfig = {
  readonly eslintPath: string;
  readonly pythonPath: string;
  readonly pmdPath: string;
  readonly useEslintForTsJs: boolean;
};

export type DecorationConfig = {
  readonly warnThreshold: number;
  readonly errorThreshold: number;
};

export type ChurnConfig = {
  readonly enabled: boolean;
  readonly lookbackDays: number;
};

export type ImpactTreeConfig = {
  readonly maxDepth: number;
};

export type GraphViewConfig = {
  readonly enabled: boolean;
};

export type AnalysisConfig = {
  readonly defaultFolder: string;
};

/**
 * File filtering configuration.
 * Groups all file-inclusion / exclusion concerns to support future include/exclude globs.
 *
 * TODO: add `includeGlob` and `excludeGlob` fields here when glob-based filtering is implemented.
 */
export type FileFilterConfig = {
  /** When true, files matched by .gitignore patterns are excluded from analysis. */
  readonly respectGitignore: boolean;
};

/**
 * Optional scope constraint for analysis.
 * When set, only files under `rootUri` are fully analyzed.
 * Call edges to symbols outside this root are kept for rank propagation
 * but those external symbols are not recursively expanded.
 */
export type AnalysisScope = {
  /** Folder URI prefix (e.g. "file:///c%3A/code/myProject/src"). Files are in scope when their URI starts with this prefix + '/'. */
  readonly rootUri: string;
};

export type DdpConfiguration = {
  readonly coverage: CoverageConfig;
  readonly rank: RankConfig;
  readonly cc: CcConfig;
  readonly decoration: DecorationConfig;
  readonly churn: ChurnConfig;
  readonly impactTree: ImpactTreeConfig;
  readonly graphView: GraphViewConfig;
  readonly analysis: AnalysisConfig;
  readonly fileFilter: FileFilterConfig;
  readonly fileRollup: "max" | "sum";
  readonly codelensEnabled: boolean;
  readonly excludeTests: boolean;
  readonly maxFiles: number;
  /**
   * When true, emits debug-level log messages for file discovery and symbol extraction.
   *
   * TODO: consider grouping under `debug: { enabled: boolean }` once a second
   * diagnostics field is needed (consistent with other grouped sub-configs).
   * The VS Code setting key is "debug" (bare boolean) rather than "debug.enabled".
   */
  readonly debugEnabled: boolean;
};

export const DEFAULT_CONFIGURATION: DdpConfiguration = {
  coverage: { fallbackT: 0, lcovGlob: "**/coverage/lcov.info", jacocoGlob: "**/jacoco.xml" },
  rank: { maxIterations: 100, epsilon: 1e-6 },
  cc: {
    eslintPath: "eslint",
    pythonPath: "python",
    pmdPath: "pmd",
    useEslintForTsJs: true,
  },
  decoration: { warnThreshold: 50, errorThreshold: 150 },
  churn: { enabled: false, lookbackDays: 90 },
  impactTree: { maxDepth: 5 },
  graphView: { enabled: false },
  analysis: { defaultFolder: "" },
  fileFilter: { respectGitignore: false },
  fileRollup: "max",
  codelensEnabled: true,
  excludeTests: true,
  maxFiles: 400,
  debugEnabled: false,
};

/** Build configuration from a key-value getter (abstracts away vscode.WorkspaceConfiguration). */
export function buildConfiguration(
  get: <T>(key: string, defaultValue: T) => T
): DdpConfiguration {
  return {
    coverage: {
      fallbackT: get<number>("coverage.fallbackT", DEFAULT_CONFIGURATION.coverage.fallbackT),
      lcovGlob: get<string>("coverage.lcovGlob", DEFAULT_CONFIGURATION.coverage.lcovGlob),
      jacocoGlob: get<string>("coverage.jacocoGlob", DEFAULT_CONFIGURATION.coverage.jacocoGlob),
    },
    rank: {
      maxIterations: get<number>("rank.maxIterations", DEFAULT_CONFIGURATION.rank.maxIterations),
      epsilon: get<number>("rank.epsilon", DEFAULT_CONFIGURATION.rank.epsilon),
    },
    cc: {
      eslintPath: get<string>("cc.eslintPath", DEFAULT_CONFIGURATION.cc.eslintPath),
      pythonPath: get<string>("cc.pythonPath", DEFAULT_CONFIGURATION.cc.pythonPath),
      pmdPath: get<string>("cc.pmdPath", DEFAULT_CONFIGURATION.cc.pmdPath),
      useEslintForTsJs: get<boolean>("cc.useEslintForTsJs", DEFAULT_CONFIGURATION.cc.useEslintForTsJs),
    },
    decoration: {
      warnThreshold: get<number>("decoration.warnThreshold", DEFAULT_CONFIGURATION.decoration.warnThreshold),
      errorThreshold: get<number>("decoration.errorThreshold", DEFAULT_CONFIGURATION.decoration.errorThreshold),
    },
    churn: {
      enabled: get<boolean>("churn.enabled", DEFAULT_CONFIGURATION.churn.enabled),
      lookbackDays: get<number>("churn.lookbackDays", DEFAULT_CONFIGURATION.churn.lookbackDays),
    },
    impactTree: {
      maxDepth: get<number>("impactTree.maxDepth", DEFAULT_CONFIGURATION.impactTree.maxDepth),
    },
    graphView: {
      enabled: get<boolean>("graphView.enabled", DEFAULT_CONFIGURATION.graphView.enabled),
    },
    analysis: {
      defaultFolder: get<string>("analysis.defaultFolder", DEFAULT_CONFIGURATION.analysis.defaultFolder),
    },
    fileFilter: {
      respectGitignore: get<boolean>("fileFilter.respectGitignore", DEFAULT_CONFIGURATION.fileFilter.respectGitignore),
    },
    fileRollup: get<"max" | "sum">("fileRollup", DEFAULT_CONFIGURATION.fileRollup),
    codelensEnabled: get<boolean>("codelens.enabled", DEFAULT_CONFIGURATION.codelensEnabled),
    excludeTests: get<boolean>("excludeTests", DEFAULT_CONFIGURATION.excludeTests),
    maxFiles: get<number>("maxFiles", DEFAULT_CONFIGURATION.maxFiles),
    debugEnabled: get<boolean>("debug", DEFAULT_CONFIGURATION.debugEnabled),
  };
}

// Re-export language patterns for backward compatibility.
// Canonical definitions live in language/patterns.ts.
export { SOURCE_FILE_GLOB, EXCLUDE_GLOB, isTestFileUri } from "../../language/patterns";
