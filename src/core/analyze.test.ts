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

  it("returns empty array for empty symbols input", () => {
    const rows = computeSymbolMetrics(
      [{ caller: "a", callee: "b" }],
      []
    );
    expect(rows).toEqual([]);
  });

  it("propagates rank from caller to callee via edges", () => {
    const rows = computeSymbolMetrics(
      [{ caller: "a", callee: "b" }],
      [
        { id: "a", uri: "file:///a.ts", name: "caller", cc: 1, t: 1 },
        { id: "b", uri: "file:///b.ts", name: "callee", cc: 1, t: 1 },
      ]
    );
    const rA = rows.find((r) => r.id === "a")!.r;
    const rB = rows.find((r) => r.id === "b")!.r;
    expect(rA).toBe(1);
    expect(rB).toBeGreaterThan(1);
  });

  it("computes CRAP = CC when t = 1 (full coverage)", () => {
    const rows = computeSymbolMetrics(
      [],
      [{ id: "a", uri: "file:///a.ts", name: "fn", cc: 5, t: 1 }]
    );
    expect(rows[0].crap).toBe(5);
  });

  it("computes CRAP = CC² + CC when t = 0 (no coverage)", () => {
    const rows = computeSymbolMetrics(
      [],
      [{ id: "a", uri: "file:///a.ts", name: "fn", cc: 4, t: 0 }]
    );
    expect(rows[0].crap).toBe(4 * 4 + 4);
  });

  it("forwards rankOptions to computeRanks", () => {
    const rows = computeSymbolMetrics(
      [{ caller: "a", callee: "b" }],
      [
        { id: "a", uri: "file:///a.ts", name: "caller", cc: 1, t: 1 },
        { id: "b", uri: "file:///b.ts", name: "callee", cc: 1, t: 1 },
      ],
      { maxIterations: 1 }
    );
    const rB = rows.find((r) => r.id === "b")!.r;
    expect(rB).toBeGreaterThan(1);
  });
});
