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
