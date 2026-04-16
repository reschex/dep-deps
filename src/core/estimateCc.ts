/**
 * Lightweight cyclomatic-complexity estimate from source text (McCabe-style decision count + 1).
 * Prefer language-specific tools when configured; this works offline for all languages.
 */

const DECISION_PATTERN =
  /\b(if|else\s+if|while|for|foreach|case|catch|&&|\|\|)\b|\?\s*[^;?:]+:/g;

function countDecisions(source: string): number {
  DECISION_PATTERN.lastIndex = 0;
  let count = 0;
  while (DECISION_PATTERN.exec(source) !== null) {
    count += 1;
  }
  return count;
}

export function estimateCyclomaticComplexity(source: string): number {
  if (!source.trim()) {
    return 1;
  }
  return Math.max(1, 1 + countDecisions(source));
}
