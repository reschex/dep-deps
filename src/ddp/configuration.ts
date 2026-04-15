/**
 * Typed configuration object for DDP analysis.
 * Single source of truth for all settings — eliminates scattered getConfiguration() calls.
 */

export type CoverageConfig = {
  readonly fallbackT: number;
  readonly lcovGlob: string;
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
  readonly fileRollup: "max" | "sum";
  readonly codelensEnabled: boolean;
  readonly excludeTests: boolean;
};

export const DEFAULT_CONFIGURATION: DdpConfiguration = {
  coverage: { fallbackT: 0, lcovGlob: "**/coverage/lcov.info" },
  rank: { maxIterations: 100, epsilon: 1e-6 },
  cc: {
    eslintPath: "eslint",
    pythonPath: "python",
    pmdPath: "pmd",
    useEslintForTsJs: true,
  },
  decoration: { warnThreshold: 50, errorThreshold: 150 },
  fileRollup: "max",
  codelensEnabled: true,
  excludeTests: true,
};

/** Build configuration from a key-value getter (abstracts away vscode.WorkspaceConfiguration). */
export function buildConfiguration(
  get: <T>(key: string, defaultValue: T) => T
): DdpConfiguration {
  return {
    coverage: {
      fallbackT: get<number>("coverage.fallbackT", DEFAULT_CONFIGURATION.coverage.fallbackT),
      lcovGlob: get<string>("coverage.lcovGlob", DEFAULT_CONFIGURATION.coverage.lcovGlob),
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
    fileRollup: get<"max" | "sum">("fileRollup", DEFAULT_CONFIGURATION.fileRollup),
    codelensEnabled: get<boolean>("codelens.enabled", DEFAULT_CONFIGURATION.codelensEnabled),
    excludeTests: get<boolean>("excludeTests", DEFAULT_CONFIGURATION.excludeTests),
  };
}

/** Default glob for source files to analyze. */
export const SOURCE_FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}";
export const EXCLUDE_GLOB = "**/node_modules/**";

/** Extensions covered by source-file analysis. */
const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "java"];

/**
 * Pre-expanded test-file globs (no nested braces — VS Code's findFiles
 * glob parser doesn't handle `{a,b{c,d}}` correctly).
 */
export const TEST_FILE_EXCLUDE_GLOBS: readonly string[] = SOURCE_EXTENSIONS.flatMap((ext) => [
  `**/*.test.${ext}`,
  `**/*.spec.${ext}`,
]);

/** Additional globs for test directories. */
export const TEST_DIR_EXCLUDE_GLOBS = [
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/test_*/**",
];

/**
 * Build the combined exclude glob for `vscode.workspace.findFiles`.
 * When `excludeTests` is true, appends test-file and test-directory patterns.
 * All patterns are flat (no nested `{…}`) so VS Code's glob parser handles them.
 */
export function buildExcludeGlob(excludeTests: boolean): string {
  if (!excludeTests) {
    return EXCLUDE_GLOB;
  }
  const patterns = [EXCLUDE_GLOB, ...TEST_FILE_EXCLUDE_GLOBS, ...TEST_DIR_EXCLUDE_GLOBS];
  return `{${patterns.join(",")}}`;
}

/** Test-file name pattern: matches .test. or .spec. before the final extension. */
const TEST_FILE_RE = /[./](?:test|spec)\.[^/\\]+$/i;

/** Test-directory segments that indicate a test folder. */
const TEST_DIR_RE = /(?:^|[/\\])(?:__tests__|tests?|test_[^/\\]+)(?:[/\\]|$)/i;

/**
 * Pure check: does a URI (or file path) look like a test file?
 * Matches common conventions across JS/TS/Python/Java.
 */
export function isTestFileUri(uri: string): boolean {
  return TEST_FILE_RE.test(uri) || TEST_DIR_RE.test(uri);
}
