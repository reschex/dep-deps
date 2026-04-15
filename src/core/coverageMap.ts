/**
 * Map statement-level coverage onto a symbol body line range (0-based lines).
 */

import { clamp01 } from "./metrics";

/** A range of line numbers (0-based, inclusive). */
export type LineRange = {
  readonly startLine: number;
  readonly endLine: number;
};

/** A single statement coverage record from LCOV or similar. */
export type StatementCover = {
  readonly executed: boolean;
  readonly startLine: number;
  readonly endLine: number;
};

function overlaps(a: LineRange, b: LineRange): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

/**
 * Compute test coverage fraction T for a symbol body.
 *
 * @param body       The line range of the function/method body (0-based).
 * @param statements Statement coverage records for the file.
 * @param fallbackT  Coverage to use when no statements overlap the body.
 * @returns T in [0, 1]: executedStatements / totalStatements within body.
 */
export function coverageFractionForSymbol(
  body: LineRange,
  statements: readonly StatementCover[],
  fallbackT: number
): number {
  let total = 0;
  let covered = 0;
  for (const s of statements) {
    const sr: LineRange = { startLine: s.startLine, endLine: s.endLine };
    if (!overlaps(body, sr)) {
      continue;
    }
    total += 1;
    if (s.executed) {
      covered += 1;
    }
  }
  if (total === 0) {
    return clamp01(fallbackT);
  }
  return covered / total;
}
