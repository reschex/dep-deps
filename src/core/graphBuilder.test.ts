import { describe, it, expect } from "vitest";
import { edgesFromCallerCallees } from "./graphBuilder";
import { computeRanks } from "./rank";

describe("edgesFromCallerCallees", () => {
  it("dedupes self-edges", () => {
    const e = edgesFromCallerCallees([{ callerId: "a", calleeIds: ["a", "b"] }]);
    expect(e).toEqual([{ caller: "a", callee: "b" }]);
  });

  it("builds a graph fake stream for rank integration", () => {
    const edges = edgesFromCallerCallees([
      { callerId: "c0", calleeIds: ["M"] },
      { callerId: "c1", calleeIds: ["M"] },
    ]);
    const r = computeRanks(edges);
    expect(r.get("M")).toBeCloseTo(3, 3);
  });
});
