import { describe, it, expect } from "vitest";
import { crap, failureRisk, failureRiskFromCrap } from "./metrics";

describe("CRAP", () => {
  it("matches partial coverage example CC=4 T=0.3", () => {
    const v = crap(4, 0.3);
    expect(v).toBeCloseTo(4 * 4 * 0.7 ** 3 + 4, 5);
  });

  it("matches paper examples A, B, C (within rounding)", () => {
    expect(crap(4, 0.3)).toBeCloseTo(9.5, 1);
    expect(crap(2, 0.5)).toBeCloseTo(2.5, 5);
    expect(crap(9, 0.2)).toBeCloseTo(50.5, 1);
  });
});

describe("failure risk F = R × CRAP", () => {
  it("matches paper F(A), F(B), F(C)", () => {
    expect(failureRisk(2, 4, 0.3)).toBeCloseTo(19, 0);
    expect(failureRisk(3, 2, 0.5)).toBeCloseTo(7.5, 5);
    expect(failureRisk(5, 9, 0.2)).toBeCloseTo(252.5, 0);
  });

  it("uses precomputed CRAP when needed", () => {
    expect(failureRiskFromCrap(2, 9.5)).toBe(19);
  });
});
