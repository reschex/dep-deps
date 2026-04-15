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
});
