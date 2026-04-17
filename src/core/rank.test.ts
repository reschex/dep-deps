import { describe, it, expect } from "vitest";
import {
  computeRanks,
  rankOneStep,
  allNodeIds,
  calleesByCaller,
  buildIncomingMap,
  outDegreesFromCallees,
  hasConverged,
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
    expect(r.get("B")).toBe(2);
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

  // Kill: ArrayDeclaration L75 → ["Stryker was here"] — initial list in buildIncomingMap
  it("buildIncomingMap: each callee list has exactly one entry per unique caller", () => {
    const edges = [
      { caller: "A", callee: "X" },
      { caller: "B", callee: "X" },
      { caller: "A", callee: "X" }, // duplicate — should be deduplicated by calleesByCaller
    ];
    const incoming = buildIncomingMap(edges);
    const xList = incoming.get("X")!;
    expect(xList).toHaveLength(2);
    expect(xList.map(e => e.caller).sort((a, b) => a.localeCompare(b))).toEqual(["A", "B"]);
  });

  it("buildIncomingMap: single edge produces single-element list", () => {
    const edges = [{ caller: "A", callee: "B" }];
    const incoming = buildIncomingMap(edges);
    expect(incoming.get("B")).toEqual([{ caller: "A" }]);
    expect(incoming.has("A")).toBe(false);
  });

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

  it("computeRanks: iteration loop actually updates ranks", () => {
    const edges = [
      { caller: "A", callee: "B" },
      { caller: "B", callee: "C" },
    ];
    const r = computeRanks(edges, { maxIterations: 100, epsilon: 1e-9 });
    // B gets contribution from A, C gets contribution from B
    expect(r.get("C")!).toBeGreaterThan(r.get("B")!);
    expect(r.get("C")!).toBeGreaterThan(r.get("A")!);
    expect(r.get("C")!).toBe(3);
    expect(r.get("B")!).toBe(2);
  });

  it("computeRanks: empty edges returns empty map", () => {
    const r = computeRanks([]);
    expect(r.size).toBe(0);
  });

  // Kill: LogicalOperator (?? → &&) on options.maxIterations
  it("computeRanks: respects explicit maxIterations (chain needs >1 iteration)", () => {
    const edges = [
      { caller: "A", callee: "B" },
      { caller: "B", callee: "C" },
    ];
    // With maxIterations=1 and epsilon=0, only one propagation step occurs
    const r = computeRanks(edges, { maxIterations: 1, epsilon: 0 });
    // After 1 step: C = 1 + rOld(B)/1 = 1 + 1 = 2 (B hasn't accumulated A's rank yet)
    expect(r.get("C")).toBe(2);
  });

  // Kill: ArithmeticOperator (a - b → a + b) inside hasConverged
  it("hasConverged: identical maps are converged for any positive epsilon", () => {
    const r = new Map([["A", 3], ["B", 5]]);
    expect(hasConverged(r, r, 1e-9)).toBe(true);
  });

  it("hasConverged: different maps are not converged when delta > epsilon", () => {
    const rOld = new Map([["A", 1], ["B", 2]]);
    const rNew = new Map([["A", 1], ["B", 3]]);
    expect(hasConverged(rOld, rNew, 0.5)).toBe(false);
  });

  // Kill: EqualityOperator (< → <=) on maxDelta < epsilon
  it("hasConverged: maxDelta exactly equal to epsilon is NOT converged (strict <)", () => {
    const rOld = new Map([["A", 1]]);
    const rNew = new Map([["A", 2]]);
    // delta = 1, epsilon = 1 → 1 < 1 is false
    expect(hasConverged(rOld, rNew, 1)).toBe(false);
  });

  it("hasConverged: empty maps are always converged", () => {
    expect(hasConverged(new Map(), new Map(), 1e-9)).toBe(true);
  });
});
