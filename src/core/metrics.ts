/**
 * CRAP (Change Risk Anti-Patterns) and failure risk F = R × CRAP.
 *
 * Formulae from Gorman, "Dependable Dependencies" (2011) and CRAP4J:
 *   CRAP = CC² × (1 − T)³ + CC
 *   F    = R × CRAP
 */

/**
 * Compute CRAP score for a single function.
 *
 * @param cc  Cyclomatic complexity (McCabe), must be ≥ 0.
 * @param t   Fraction of code covered by tests, clamped to [0, 1].
 * @returns   CRAP score: CC² × (1 − T)³ + CC.
 */
export function crap(cc: number, t: number): number {
  const clampedT = clamp01(t);
  const clampedCc = Math.max(0, cc);
  return clampedCc * clampedCc * Math.pow(1 - clampedT, 3) + clampedCc;
}

/** Compute failure risk F = R × CRAP(CC, T). */
export function failureRisk(rank: number, cc: number, t: number): number {
  return rank * crap(cc, t);
}

/** Compute failure risk from a pre-computed CRAP value: F = R × CRAP. */
export function failureRiskFromCrap(rank: number, crapValue: number): number {
  return rank * crapValue;
}

/** Clamp a number to [0, 1], treating NaN as 0. */
export function clamp01(t: number): number {
  if (Number.isNaN(t) || t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}
