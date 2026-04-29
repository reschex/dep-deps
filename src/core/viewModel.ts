import type { SymbolMetrics } from "./analyze";

/** Supported sort fields for symbol lists. */
export type SortField = "f" | "fPrime" | "g" | "cc" | "crap";

/** Sort symbols by the given field, descending (highest first). */
export function sortSymbols(symbols: readonly SymbolMetrics[], field: SortField): SymbolMetrics[] {
  return [...symbols].sort((a, b) => b[field] - a[field]);
}

/** Filter symbols that belong to a specific file URI. */
export function symbolsForFile(uriStr: string, symbols: readonly SymbolMetrics[]): SymbolMetrics[] {
  return symbols.filter((s) => s.uri === uriStr);
}

/** Format a Markdown hover breakdown showing all metric components. */
export function formatHoverBreakdown(s: SymbolMetrics): string {
  const insights = analyzeMetrics(s);
  const insightLine = insights.length > 0 ? insights.join("  \n") : "";
  return (
    `**DDP risk**  F=${s.f.toFixed(1)}  (R×CRAP)\n\n` +
    `- R (rank): ${s.r.toFixed(3)}\n` +
    `- CRAP: ${s.crap.toFixed(2)}\n` +
    `- CC: ${s.cc}\n` +
    `- T (coverage): ${(s.t * 100).toFixed(0)}%\n\n` +
    insightLine
  );
}

// Thresholds that determine which insight messages are shown in the hover tooltip.
const HIGH_CC = 10;
const LOW_COVERAGE = 0.5;
const WELL_TESTED = 0.8;
const HIGH_RANK_WITH_RISK = 3;
const HIGH_CRAP_WITH_RISK = 30;
const HIGH_RANK = 5;
const HIGH_F = 100;
const HIGH_CHURN = 2;

/** Generate dynamic insight strings based on metric values. */
function analyzeMetrics(s: SymbolMetrics): string[] {
  const insights: string[] = [];

  if (s.cc >= HIGH_CC && s.t < LOW_COVERAGE) {
    insights.push("High complexity with low coverage — write tests to reduce CRAP.");
  } else if (s.cc >= HIGH_CC && s.t >= WELL_TESTED) {
    insights.push("Complex but well-tested — coverage keeps CRAP in check.");
  }
  // cc >= HIGH_CC with coverage between LOW_COVERAGE and WELL_TESTED: trending
  // toward well-tested but not yet urgent — no message until it crosses a threshold.

  if (s.r >= HIGH_RANK_WITH_RISK && s.crap >= HIGH_CRAP_WITH_RISK) {
    insights.push("Failures here cascade through dependents — consider decoupling or adding tests.");
  } else if (s.r >= HIGH_RANK) {
    insights.push("Widely depended upon — changes here affect many callers.");
  }

  if (s.f >= HIGH_F && s.g > HIGH_CHURN) {
    insights.push("Risky and frequently changed — most urgent priority to address.");
  }

  return insights;
}

/** Format a compact CodeLens title showing key metrics. */
export function formatCodeLensTitle(s: SymbolMetrics): string {
  return `DDP F=${s.f.toFixed(0)}  R=${s.r.toFixed(2)}  CRAP=${s.crap.toFixed(1)}`;
}

export { decorationTier } from "./rollup";
