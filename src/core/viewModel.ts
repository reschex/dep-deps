import type { SymbolMetrics } from "./analyze";

/** Supported sort fields for symbol lists. */
export type SortField = "f" | "fPrime" | "g" | "cc" | "crap";

/** Sort symbols by the given field, descending (highest first). */
export function sortSymbols(symbols: readonly SymbolMetrics[], field: SortField): SymbolMetrics[] {
  return [...symbols].sort((a, b) => b[field] - a[field]);
}

/** Sort symbols by failure risk F descending (highest risk first). */
export function sortSymbolsByFDescending(symbols: readonly SymbolMetrics[]): SymbolMetrics[] {
  return [...symbols].sort((a, b) => b.f - a.f);
}

/** Filter symbols that belong to a specific file URI. */
export function symbolsForFile(uriStr: string, symbols: readonly SymbolMetrics[]): SymbolMetrics[] {
  return symbols.filter((s) => s.uri === uriStr);
}

/** Format a Markdown hover breakdown showing all metric components. */
export function formatHoverBreakdown(s: SymbolMetrics): string {
  return (
    `**DDP risk**  F=${s.f.toFixed(1)}  (R×CRAP)\n\n` +
    `- R (rank): ${s.r.toFixed(3)}\n` +
    `- CRAP: ${s.crap.toFixed(2)}\n` +
    `- CC: ${s.cc}\n` +
    `- T (coverage): ${(s.t * 100).toFixed(0)}%\n\n` +
    `High rank + high CRAP ⇒ higher impact if this unit fails.`
  );
}

/** Format a compact CodeLens title showing key metrics. */
export function formatCodeLensTitle(s: SymbolMetrics): string {
  return `DDP F=${s.f.toFixed(0)}  R=${s.r.toFixed(2)}  CRAP=${s.crap.toFixed(1)}`;
}

export { decorationTier } from "./rollup";
