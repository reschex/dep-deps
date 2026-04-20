import { describe, it, expect } from "vitest";
import { churnMultiplier, applyChurn } from "./churn";
import type { SymbolMetrics } from "./analyze";

function sym(uri: string, f: number): SymbolMetrics {
  return { id: "x", uri, name: "fn", cc: 2, t: 0.5, r: 1, crap: 2, f, g: 1, fPrime: f };
}

describe("churnMultiplier", () => {
  it("returns 1 for zero commits", () => {
    expect(churnMultiplier(0)).toBe(1);
  });

  it("returns a value greater than 1 for positive commit count", () => {
    expect(churnMultiplier(10)).toBeGreaterThan(1);
  });

  it("is monotonically increasing — more commits yields higher multiplier", () => {
    expect(churnMultiplier(5)).toBeLessThan(churnMultiplier(10));
    expect(churnMultiplier(10)).toBeLessThan(churnMultiplier(100));
  });

  it("is sub-linear — doubling commits does not double the multiplier", () => {
    const g10 = churnMultiplier(10);
    const g20 = churnMultiplier(20);
    expect(g20).toBeLessThan(g10 * 2);
  });
});

describe("applyChurn", () => {
  it("sets g and fPrime on symbols whose URI appears in the counts map", () => {
    const symbols = [sym("file:///a.ts", 10)];
    const counts = new Map([["file:///a.ts", 5]]);
    const result = applyChurn(symbols, counts);
    const expected = churnMultiplier(5);
    expect(result[0].g).toBeCloseTo(expected);
    expect(result[0].fPrime).toBeCloseTo(10 * expected);
  });

  it("leaves g=1 and fPrime=f for symbols not in the counts map", () => {
    const symbols = [sym("file:///b.ts", 7)];
    const counts = new Map<string, number>();
    const result = applyChurn(symbols, counts);
    expect(result[0].g).toBe(1);
    expect(result[0].fPrime).toBe(7);
  });

  it("does not mutate the input array", () => {
    const original = sym("file:///a.ts", 5);
    const symbols = [original];
    applyChurn(symbols, new Map([["file:///a.ts", 10]]));
    expect(original.g).toBe(1);
  });
});
