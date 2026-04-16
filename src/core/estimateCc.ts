/**
 * Lightweight cyclomatic-complexity estimate from source text (McCabe-style decision count + 1).
 * Prefer language-specific tools when configured; this works offline for all languages.
 */

function countDecisions(source: string): number {
  const pattern =
    /\b((?<!\belse\s+)if|else\s+if|while|for|foreach|case|catch|&&|\|\|)\b|\?\s*[^;?:]+:/g;
  let count = 0;
  while (pattern.exec(source) !== null) {
    count += 1;
  }
  return count;
}

export function estimateCyclomaticComplexity(source: string): number {
  return Math.max(1, 1 + countDecisions(source));
}
