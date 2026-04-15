/**
 * Lightweight cyclomatic-complexity estimate from source text (McCabe-style decision count + 1).
 * Prefer language-specific tools when configured; this works offline for all languages.
 */
export function estimateCyclomaticComplexity(source: string): number {
  if (!source.trim()) {
    return 1;
  }
  let decisions = 0;
  const keywords =
    /\b(if|else\s+if|while|for|foreach|case|catch|&&|\|\|)\b|\?\s*[^;?:]+:/g;
  const s = source;
  keywords.lastIndex = 0;
  while (keywords.exec(s) !== null) {
    decisions += 1;
  }
  return Math.max(1, 1 + decisions);
}
