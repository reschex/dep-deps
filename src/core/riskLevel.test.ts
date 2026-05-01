/**
 * Tests for risk level classification from F score.
 *
 * Scenario: Risk level classification
 * From: features/call-graph-visualization.feature (Phase 3: CLI Output)
 *
 * Risk thresholds from TODO.md:
 *   LOW:      F <= 50
 *   MEDIUM:   50 < F <= 200
 *   HIGH:     200 < F <= 500
 *   CRITICAL: F > 500
 */

import { describe, it, expect } from "vitest";
import { classifyRisk } from "./riskLevel";

describe("classifyRisk", () => {
  it("returns LOW when F is 0", () => {
    expect(classifyRisk(0)).toBe("LOW");
  });

  it("returns LOW when F is exactly 50", () => {
    expect(classifyRisk(50)).toBe("LOW");
  });

  it("returns MEDIUM when F is just above 50", () => {
    expect(classifyRisk(50.01)).toBe("MEDIUM");
  });

  it("returns MEDIUM when F is exactly 200", () => {
    expect(classifyRisk(200)).toBe("MEDIUM");
  });

  it("returns HIGH when F is just above 200", () => {
    expect(classifyRisk(200.01)).toBe("HIGH");
  });

  it("returns HIGH when F is exactly 500", () => {
    expect(classifyRisk(500)).toBe("HIGH");
  });

  it("returns CRITICAL when F is just above 500", () => {
    expect(classifyRisk(500.01)).toBe("CRITICAL");
  });

  it("returns CRITICAL for very large F values", () => {
    expect(classifyRisk(10000)).toBe("CRITICAL");
  });
});
