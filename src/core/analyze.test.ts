import { describe, it, expect } from "vitest";
import { computeSymbolMetrics } from "./analyze";

describe("computeSymbolMetrics", () => {
  it("assigns R=1 and F=R*CRAP for isolated symbols", () => {
    const rows = computeSymbolMetrics(
      [],
      [{ id: "only", uri: "file:///a.ts", name: "only", cc: 2, t: 0.5 }]
    );
    expect(rows[0].r).toBe(1);
    expect(rows[0].f).toBeCloseTo(1 * (2 * 2 * 0.5 ** 3 + 2), 5);
  });

  it("defaults g to 1 and fPrime to f before churn is applied", () => {
    const rows = computeSymbolMetrics(
      [],
      [{ id: "a", uri: "file:///a.ts", name: "fn", cc: 3, t: 0 }]
    );
    expect(rows[0].g).toBe(1);
    expect(rows[0].fPrime).toBe(rows[0].f);
  });
});
