/**
 * Lightweight cyclomatic-complexity estimate from source text (McCabe-style decision count + 1).
 * Prefer language-specific tools when configured; this works offline for all languages.
 */

const KEYWORD_DECISIONS = ["while", "for", "foreach", "case", "catch"];

function countDecisions(source: string): number {
  let count = 0;

  // Count keyword-based decisions via word boundaries
  for (const kw of KEYWORD_DECISIONS) {
    const pattern = new RegExp(String.raw`\b${kw}\b`, "g");
    while (pattern.exec(source) !== null) {
      count += 1;
    }
  }

  // Count `if` that is NOT preceded by `else` (standalone if)
  // and `else if` as a single decision each
  const ifPattern = /\b(else\s+)?if\b/g;
  while (ifPattern.exec(source) !== null) {
    count += 1;
  }

  // Count logical operators && and ||
  const logicalPattern = /&&|\|\|/g;
  while (logicalPattern.exec(source) !== null) {
    count += 1;
  }

  // Count ternary expressions: ? <expr> :
  const ternaryPattern = /\?\s*[^;?:]+:/g;
  while (ternaryPattern.exec(source) !== null) {
    count += 1;
  }

  return count;
}

export function estimateCyclomaticComplexity(source: string): number {
  return Math.max(1, 1 + countDecisions(source));
}
