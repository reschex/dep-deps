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

describe("mutation-killing: clamp01", () => {
  // Kill: ConditionalExpression L34 → false / LogicalOperator L34 → NaN && t < 0
  it("clamp01 returns 0 for NaN", () => {
    // cc=1, t=NaN → clampedT=0, clampedCc=1 → 1*1*1 + 1 = 2
    expect(crap(1, NaN)).toBe(2);
  });

  // Kill: EqualityOperator L34 → t <= 0 (changes t < 0 to t <= 0)
  it("clamp01 returns 0 for t=0 (not clamped up)", () => {
    // t=0 should remain 0, not be clamped to something else
    expect(crap(1, 0)).toBe(2); // 1*1*(1-0)^3 + 1 = 2
  });

  it("clamp01 returns 0 for negative t", () => {
    expect(crap(1, -0.5)).toBe(2); // clamp01(-0.5)=0
  });

  // Kill: ConditionalExpression L37 → false / EqualityOperator L37 → t >= 1
  it("clamp01 returns 1 for t > 1", () => {
    expect(crap(2, 1.5)).toBe(2); // clamp01(1.5)=1, so 2*2*(1-1)^3 + 2 = 2
  });

  it("clamp01 returns 1 for t = 1", () => {
    expect(crap(2, 1)).toBe(2); // same as above
  });

  it("clamp01 passes through values in (0, 1)", () => {
    // t=0.5, cc=2: 2*2*(0.5)^3 + 2 = 4*0.125 + 2 = 2.5
    expect(crap(2, 0.5)).toBeCloseTo(2.5, 5);
  });

  it("crap is cc when t=1 (full coverage)", () => {
    expect(crap(5, 1)).toBe(5);
    expect(crap(10, 1)).toBe(10);
  });

  it("clamp01 treats exactly 0 as valid (not negative)", () => {
    // t=0 should not be treated as negative: cc=4, t=0 → 4^2 * 1^3 + 4 = 20
    expect(crap(4, 0)).toBe(20);
  });
});
