/**
 * Risk level classification from failure risk (F) score.
 *
 * Thresholds:
 *   LOW:      F <= 50
 *   MEDIUM:   50 < F <= 200
 *   HIGH:     200 < F <= 500
 *   CRITICAL: F > 500
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Classify a failure risk score into a risk level. */
export function classifyRisk(f: number): RiskLevel {
  if (f > 500) return "CRITICAL";
  if (f > 200) return "HIGH";
  if (f > 50) return "MEDIUM";
  return "LOW";
}
