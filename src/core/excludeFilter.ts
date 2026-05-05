/**
 * User-defined exclude pattern filtering.
 *
 * Matches file URIs against glob patterns to exclude files/folders from analysis.
 * Patterns use standard glob syntax (e.g. "**\/generated\/**", "**\/register*.ts").
 */

import { minimatch } from "minimatch";

/**
 * Check whether a file URI matches any of the user-defined exclude patterns.
 *
 * Extracts the path portion from the URI and tests it against each glob pattern.
 * Returns `true` when the file should be excluded from analysis.
 *
 * @param uri      File URI (e.g. "file:///project/src/foo.ts")
 * @param patterns Array of glob patterns (e.g. ["**\/generated\/**", "**\/register*.ts"])
 */
export function matchesExcludePattern(uri: string, patterns: readonly string[]): boolean {
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

  return patterns.some((pattern) =>
    minimatch(path, pattern, { dot: true, matchBase: !pattern.includes("/") })
  );
}
