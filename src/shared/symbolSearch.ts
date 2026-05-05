/**
 * Shared symbol-search utilities.
 *
 * Path-boundary matching logic extracted from cli/main.ts and
 * adapter/mcp/tools/analyzeFile.ts to eliminate duplication.
 */

import type { SymbolMetrics } from '../core/analyze';

/**
 * Return true if `uri` refers to the same file as `filePath`.
 *
 * Matching rules:
 *  - Backslashes normalised to forward slashes on both sides.
 *  - Exact match: uri === filePath (handles absolute/URI paths).
 *  - Suffix match at a path boundary: uri ends with "/" + filePath
 *    (handles relative paths without matching partial filenames).
 *
 * @param uri      The symbol URI from the analysis result.
 * @param filePath The file path supplied by the caller (relative or absolute).
 */
export function matchesFilePath(uri: string, filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const normUri = uri.replace(/\\/g, '/');
  return normUri === norm || normUri.endsWith('/' + norm);
}

/**
 * Find a symbol by name and file path within an array of symbol metrics.
 *
 * @param symbols  Array of symbols from the analysis result.
 * @param file     File path to match (relative or absolute, forward or back slashes).
 * @param name     Symbol name to match.
 */
export function findSymbol(
  symbols: readonly SymbolMetrics[],
  file: string,
  name: string,
): SymbolMetrics | undefined {
  return symbols.find((s) => s.name === name && matchesFilePath(s.uri, file));
}
