import type { SymbolMetrics } from "./analyze";

/** Returns G ≥ 1. Log-scaled so high-churn outliers don't dominate. */
export function churnMultiplier(commitCount: number): number {
  return 1 + Math.log1p(commitCount);
}

/** Returns a new array of symbols with g and fPrime set from the commit counts map.
 *  Symbols whose URI is absent from the map are unchanged (g=1, fPrime=f). */
export function applyChurn(
  symbols: readonly SymbolMetrics[],
  counts: Map<string, number>
): SymbolMetrics[] {
  return symbols.map((s) => {
    const count = counts.get(s.uri);
    if (count === undefined) return { ...s };
    const g = churnMultiplier(count);
    return { ...s, g, fPrime: s.f * g };
  });
}
