/**
 * Pure parsing utilities for symbol IDs of the form "uri#line:character".
 * No VS Code dependency — safe for unit testing with vitest.
 */

export const supportedSchemes = new Set(["file", "untitled"]);

/** Parse a symbolId of the form "uri#line:character" into its parts. Returns undefined for malformed ids. */
export function parseSymbolIdParts(symbolId: string): { uriStr: string; line: number; ch: number } | undefined {
  const hash = symbolId.indexOf("#");
  if (hash <= 0) {
    return undefined;
  }
  const uriStr = symbolId.slice(0, hash);
  const rest = symbolId.slice(hash + 1);
  const parts = rest.split(":");
  const line = Number.parseInt(parts[0] ?? "", 10);
  const ch = Number.parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(line) || Number.isNaN(ch)) {
    return undefined;
  }
  return { uriStr, line, ch };
}
