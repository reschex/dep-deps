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
  return [
    complexityInsight(s),
    dependencyInsight(s),
    churnInsight(s),
  ].filter((m): m is string => m !== null);
}

/**
 * Insight for complexity vs coverage.
 *
 * Coverage between LOW_COVERAGE and WELL_TESTED is the silent zone — trending
 * toward well-tested but not yet urgent. No message until it crosses a threshold.
 */
function complexityInsight(s: SymbolMetrics): string | null {
  if (s.cc < HIGH_CC) return null;
  if (s.t < LOW_COVERAGE) {
    return "High complexity with low coverage — write tests to reduce CRAP.";
  }
  if (s.t >= WELL_TESTED) {
    return "Complex but well-tested — coverage keeps CRAP in check.";
  }
  return null;
}

/** Insight for dependency-graph importance (rank) and CRAP. */
function dependencyInsight(s: SymbolMetrics): string | null {
  if (s.r >= HIGH_RANK_WITH_RISK && s.crap >= HIGH_CRAP_WITH_RISK) {
    return "Failures here cascade through dependents — consider decoupling or adding tests.";
  }
  if (s.r >= HIGH_RANK) {
    return "Widely depended upon — changes here affect many callers.";
  }
  return null;
}

/** Insight for risky code that changes frequently (churn). */
function churnInsight(s: SymbolMetrics): string | null {
  if (s.f >= HIGH_F && s.g > HIGH_CHURN) {
    return "Risky and frequently changed — most urgent priority to address.";
  }
  return null;
}

/** Format a compact CodeLens title showing key metrics. */
export function formatCodeLensTitle(s: SymbolMetrics): string {
  return `DDP F=${s.f.toFixed(0)}  R=${s.r.toFixed(2)}  CRAP=${s.crap.toFixed(1)}`;
}

export { decorationTier } from "./rollup";
