/**
 * Shared formatters for symbol metric display labels.
 *
 * Used by tree views, hover formatters, and impact tree renderers. Centralised
 * here so the "F=?" fallback and the F-precision are defined once.
 */

import type { SymbolMetrics } from "./analyze";

/**
 * Format the failure-risk label `F=12.3` for display, or `F=?` when metrics
 * are unavailable for the symbol (e.g. caller has no resolved entry).
 */
export function formatFLabel(metrics: SymbolMetrics | undefined): string {
  return metrics ? `F=${metrics.f.toFixed(1)}` : "F=?";
}
