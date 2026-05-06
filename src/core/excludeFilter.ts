/**
 * User-defined exclude pattern filtering.
 *
 * Matches file URIs against glob patterns to exclude files/folders from analysis.
 * Patterns use standard glob syntax (e.g. "**\/generated\/**", "**\/register*.ts").
 */

import { minimatch } from "minimatch";

/**
 * Default glob patterns that identify test files across JS/TS, Python, and Java.
 *
 * User-configurable glob patterns shipped as defaults.
 * Use with `nocase: true` to match case-insensitive conventions (e.g. __TESTS__, .TEST.).
 */
export const DEFAULT_TEST_EXCLUDE_PATTERNS: readonly string[] = [
  // ── File-name conventions (JS/TS/Python) ──
  "**/*.test.*",    // foo.test.ts, bar.test.py
  "**/*.spec.*",    // foo.spec.js, bar.spec.mjs

  // ── Java conventions ──
  "**/*Test.java",  // FooTest.java
  "**/*Tests.java", // FooTests.java
  "**/*IT.java",    // ServiceIT.java (integration tests)

  // ── Directory conventions ──
  "**/__tests__/**",  // Jest __tests__/
  "**/test/**",       // test/ directory
  "**/tests/**",      // tests/ directory
  "**/test_*/**",     // test_integration/, test_e2e/, etc.
];

/** Options for exclude pattern matching. */
export type ExcludeMatchOptions = {
  /** When true, patterns match case-insensitively (e.g. "*.test.*" matches "foo.TEST.ts"). */
  readonly nocase?: boolean;
};

/**
 * Check whether a file URI matches any of the user-defined exclude patterns.
 *
 * Extracts the path portion from the URI and tests it against each glob pattern.
 * Returns `true` when the file should be excluded from analysis.
 *
 * @param uri      File URI (e.g. "file:///project/src/foo.ts")
 * @param patterns Array of glob patterns (e.g. ["**\/generated\/**", "**\/register*.ts"])
 * @param options  Optional matching options (e.g. case-insensitive mode)
 */
export function matchesExcludePattern(
  uri: string,
  patterns: readonly string[],
  options?: ExcludeMatchOptions,
): boolean {
  if (patterns.length === 0) {
    return false;
  }

  // Extract path from file URI for glob matching.
  // "file:///project/src/foo.ts" → "/project/src/foo.ts"
  // "file:///C%3A/code/proj/src/foo.ts" → "/C:/code/proj/src/foo.ts"
  let path: string;
  try {
    path = new URL(uri).pathname;
  } catch {
    // If not a valid URL, use URI as-is (defensive)
    path = uri;
  }

  // Decode percent-encoding (e.g. %3A → :). Defensive: malformed sequences
  // throw URIError — fall back to raw path rather than crash analysis.
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep `path` as-is
  }

  const nocase = options?.nocase ?? false;

  return patterns.some((pattern) =>
    minimatch(path, pattern, { dot: true, nocase, matchBase: !pattern.includes("/") })
  );
}
