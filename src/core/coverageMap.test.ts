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

describe("mutation-killing: coverageMap.ts", () => {
  // Kill: overlaps mutations — ConditionalExpression L21 → true, LogicalOperator L21 swap
  it("statement fully before body does not overlap", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [{ executed: true, startLine: 0, endLine: 9 }];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(0);
  });

  it("statement fully after body does not overlap", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [{ executed: true, startLine: 21, endLine: 30 }];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(0);
  });

  it("statement exactly at body start overlaps", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [{ executed: true, startLine: 10, endLine: 10 }];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(1);
  });

  it("statement exactly at body end overlaps", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [{ executed: true, startLine: 20, endLine: 20 }];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(1);
  });

  it("statement spanning body boundary overlaps", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [{ executed: true, startLine: 5, endLine: 15 }];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(1);
  });

  // Kill: BlockStatement L41 → {} / ConditionalExpression L41 → false
  // This is the overlap check — if mutated to skip, no statements counted
  it("counts both executed and non-executed overlapping statements", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [
      { executed: true, startLine: 12, endLine: 12 },
      { executed: false, startLine: 14, endLine: 14 },
    ];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 when all overlapping statements are unexecuted", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [
      { executed: false, startLine: 12, endLine: 12 },
      { executed: false, startLine: 14, endLine: 14 },
    ];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(0);
  });

  it("returns 1 when all overlapping statements are executed", () => {
    const body = { startLine: 10, endLine: 20 };
    const stmts = [
      { executed: true, startLine: 12, endLine: 12 },
      { executed: true, startLine: 14, endLine: 14 },
    ];
    expect(coverageFractionForSymbol(body, stmts, 0)).toBe(1);
  });
});
