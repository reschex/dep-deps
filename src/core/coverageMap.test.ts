import { describe, it, expect } from "vitest";
import { coverageFractionForSymbol } from "./coverageMap";

describe("coverageFractionForSymbol", () => {
  const body = { startLine: 10, endLine: 20 };

  it("returns ratio of executed statements overlapping body", () => {
    const statements = [
      { executed: true, startLine: 10, endLine: 10 },
      { executed: false, startLine: 15, endLine: 15 },
      { executed: true, startLine: 20, endLine: 20 },
    ];
    expect(coverageFractionForSymbol(body, statements, 0)).toBeCloseTo(2 / 3, 5);
  });

  it("ignores statements outside body", () => {
    const statements = [{ executed: false, startLine: 0, endLine: 5 }];
    expect(coverageFractionForSymbol(body, statements, 0)).toBe(0);
  });

  it("uses fallback when no statements overlap", () => {
    expect(coverageFractionForSymbol(body, [], 0.25)).toBe(0.25);
  });
});
