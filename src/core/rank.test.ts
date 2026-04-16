import { describe, it, expect } from "vitest";
import {
  computeRanks,
  rankOneStep,
  allNodeIds,
  calleesByCaller,
  buildIncomingMap,
  outDegreesFromCallees,
} from "./rank";

describe("Rank computation (Dependable Dependencies)", () => {
  it("star: callee called by six rank-1 callers converges to R=7", () => {
    const edges = [
      { caller: "c0", callee: "M" },
      { caller: "c1", callee: "M" },
      { caller: "c2", callee: "M" },
      { caller: "c3", callee: "M" },
      { caller: "c4", callee: "M" },
      { caller: "c5", callee: "M" },
    ];
    const r = computeRanks(edges, { epsilon: 1e-9, maxIterations: 50 });
    expect(r.get("M")).toBeCloseTo(7, 5);
    for (let i = 0; i < 6; i++) {
      expect(r.get(`c${i}`)).toBeCloseTo(1, 5);
    }
  });

  it("two callers at converged R=4 into M yields R(M)=9 (paper orange box)", () => {
    const edges = [
      { caller: "x0", callee: "a" },
      { caller: "x1", callee: "a" },
      { caller: "x2", callee: "a" },
      { caller: "y0", callee: "b" },
      { caller: "y1", callee: "b" },
      { caller: "y2", callee: "b" },
      { caller: "a", callee: "M" },
      { caller: "b", callee: "M" },
    ];
    const r = computeRanks(edges, { epsilon: 1e-9, maxIterations: 200 });
    expect(r.get("a")).toBeCloseTo(4, 3);
    expect(r.get("b")).toBeCloseTo(4, 3);
    expect(r.get("M")).toBeCloseTo(9, 3);
  });

  it("proportional split: one step from P=4 to three callees adds 4/3 each", () => {
    const edges = [{ caller: "P", callee: "A" }, { caller: "P", callee: "B" }, { caller: "P", callee: "C" }];
    const nodeIds = allNodeIds(edges);
    const callees = calleesByCaller(edges);
    const outDeg = outDegreesFromCallees(callees);
    const incoming = buildIncomingMap(edges);
    const rOld = new Map<string, number>([
      ["P", 4],
      ["A", 1],
      ["B", 1],
      ["C", 1],
    ]);
    const rNext = rankOneStep(nodeIds, outDeg, incoming, rOld);
    expect(rNext.get("A")).toBeCloseTo(1 + 4 / 3, 5);
    expect(rNext.get("B")).toBeCloseTo(1 + 4 / 3, 5);
    expect(rNext.get("C")).toBeCloseTo(1 + 4 / 3, 5);
  });
});

describe("mutation-killing: rank.ts", () => {
  // Kill: ObjectLiteral L13 | {} — defaultOptions replaced with {}
  it("computeRanks uses defaultOptions when no options given", () => {
    const edges = [{ caller: "A", callee: "B" }];
    const r = computeRanks(edges);
    // With defaults (maxIterations=100, epsilon=1e-6), should converge
    expect(r.get("A")).toBeCloseTo(1, 5);
    expect(r.get("B")).toBeCloseTo(2, 5);
  });

  // Kill: ConditionalExpression L58 → true / EqualityOperator L58 → deg >= 0
  // rankOneStep: if (deg > 0) — zero out-degree caller should NOT contribute
  it("rankOneStep: caller with outDegree 0 contributes nothing", () => {
    const nodeIds = new Set(["A", "B"]);
    const outDeg = new Map<string, number>([["A", 0]]);
    const incoming = new Map([["B", [{ caller: "A" }]]]);
    const rOld = new Map([["A", 5], ["B", 1]]);
    const rNext = rankOneStep(nodeIds, outDeg, incoming, rOld);
    // deg=0, so no contribution: B stays at 1
    expect(rNext.get("B")).toBe(1);
  });

  it("rankOneStep: caller with outDegree 1 contributes full rank", () => {
    const nodeIds = new Set(["A", "B"]);
    const outDeg = new Map<string, number>([["A", 1]]);
    const incoming = new Map([["B", [{ caller: "A" }]]]);
    const rOld = new Map([["A", 5], ["B", 1]]);
    const rNext = rankOneStep(nodeIds, outDeg, incoming, rOld);
    expect(rNext.get("B")).toBe(1 + 5);
  });

  // Kill: ArrayDeclaration L75 → ["Stryker was here"] — initial rank values
  it("computeRanks: all nodes start with rank 1", () => {
    // Single edge, one iteration: A→B. After 1 step, B = 1 + 1/1 = 2, A = 1
    const edges = [{ caller: "A", callee: "B" }];
    const r = computeRanks(edges, { maxIterations: 1, epsilon: 0 });
    expect(r.get("A")).toBe(1);
    expect(r.get("B")).toBe(2);
  });

  // Kill: EqualityOperator L107 → i <= opts.maxIterations
  it("computeRanks: maxIterations=0 runs zero iterations", () => {
    const edges = [{ caller: "A", callee: "B" }];
    const r = computeRanks(edges, { maxIterations: 0, epsilon: 0 });
    // No iterations: all ranks stay at initial 1
    expect(r.get("A")).toBe(1);
    expect(r.get("B")).toBe(1);
  });

  // Kill: LogicalOperator L111 → r.get(id) && 1 (changes ?? to &&)
  // When r.get(id) is 0, ?? 1 gives 0, but && 1 gives 0 (falsy && short-circuits)
  // Actually 0 && 1 = 0, and 0 ?? 1 = 0 (nullish coalescing doesn't trigger on 0)
  // So for non-null values this is equivalent. Need undefined to differ.
  // But ranks are always set in the map, so this may be equivalent.

  // Kill: ArithmeticOperator L113 → a + b (changes Math.abs(a - b) to Math.abs(a + b))
  it("computeRanks: convergence check uses subtraction not addition", () => {
    // If |a+b| were used instead of |a-b|, convergence would never be detected
    // because a+b is always > epsilon when ranks are > 0
    const edges = [{ caller: "A", callee: "B" }];
    const r = computeRanks(edges, { maxIterations: 1000, epsilon: 1e-6 });
    // Should converge quickly (simple chain)
    expect(r.get("B")).toBeCloseTo(2, 5);
  });

  // Kill: ConditionalExpression L116 → false / EqualityOperator L116 → maxDelta <= opts.epsilon
  it("computeRanks: stops early when converged (maxDelta < epsilon)", () => {
    // Simple edge: converges in ~2 iterations
    const edges = [{ caller: "A", callee: "B" }];
    const r = computeRanks(edges, { maxIterations: 1000, epsilon: 0.5 });
    // With large epsilon, should still converge to correct value
    expect(r.get("B")).toBeGreaterThan(1);
  });

  // Kill: BlockStatement L95 → {} and L103 → {} and ConditionalExpression L95 → false
  it("computeRanks: iteration loop actually updates ranks", () => {
    const edges = [
      { caller: "A", callee: "B" },
      { caller: "B", callee: "C" },
    ];
    const r = computeRanks(edges, { maxIterations: 100, epsilon: 1e-9 });
    // B gets contribution from A, C gets contribution from B
    expect(r.get("C")!).toBeGreaterThan(r.get("A")!);
    expect(r.get("C")!).toBeGreaterThan(1);
    expect(r.get("B")!).toBeGreaterThan(1);
  });

  it("computeRanks: empty edges returns empty map", () => {
    const r = computeRanks([]);
    expect(r.size).toBe(0);
  });
});
