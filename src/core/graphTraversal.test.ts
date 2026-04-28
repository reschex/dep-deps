import { describe, it, expect } from "vitest";
import { indexEdges, buildCallerTree } from "./graphTraversal";
import type { CallEdge } from "./rank";

describe("indexEdges", () => {
  it("builds empty index for empty edges", () => {
    const index = indexEdges([]);
    expect(index.callersByCallee.size).toBe(0);
  });

  it("indexes single edge: caller appears in callee's list", () => {
    const edges: CallEdge[] = [{ caller: "A", callee: "B" }];
    const index = indexEdges(edges);
    expect(index.callersByCallee.get("B")).toEqual(["A"]);
  });

  it("groups multiple callers for the same callee", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "C" },
      { caller: "B", callee: "C" },
    ];
    const index = indexEdges(edges);
    const callers = index.callersByCallee.get("C") ?? [];
    expect(callers).toHaveLength(2);
    expect(callers).toContain("A");
    expect(callers).toContain("B");
  });
});

describe("buildCallerTree", () => {
  it("returns leaf node for symbol with no callers", () => {
    const index = indexEdges([]);
    const tree = buildCallerTree("A", index, 3);
    expect(tree).toEqual({
      symbolId: "A",
      callers: [],
      depth: 0,
      isRecursive: false,
    });
  });

  it("builds one level of callers", () => {
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);

    expect(tree.symbolId).toBe("A");
    expect(tree.callers).toHaveLength(2);
    expect(tree.callers.map((c) => c.symbolId).sort()).toEqual(["B", "C"]);
    expect(tree.callers[0].depth).toBe(1);
    expect(tree.callers[0].isRecursive).toBe(false);
  });

  it("builds multi-level caller tree (transitive dependencies)", () => {
    const edges: CallEdge[] = [
      { caller: "checkout", callee: "processOrder" },
      { caller: "apiRoute", callee: "checkout" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("processOrder", index, 3);

    expect(tree.symbolId).toBe("processOrder");
    expect(tree.callers).toHaveLength(1);

    const checkout = tree.callers[0];
    expect(checkout.symbolId).toBe("checkout");
    expect(checkout.depth).toBe(1);
    expect(checkout.callers).toHaveLength(1);

    const apiRoute = checkout.callers[0];
    expect(apiRoute.symbolId).toBe("apiRoute");
    expect(apiRoute.depth).toBe(2);
    expect(apiRoute.callers).toHaveLength(0);
  });

  it("stops at maxDepth — omits deeper callers", () => {
    const edges: CallEdge[] = [
      { caller: "D", callee: "C" },
      { caller: "C", callee: "B" },
      { caller: "B", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 2);

    // depth 0: A, depth 1: B, depth 2: C (at limit, no children)
    expect(tree.callers).toHaveLength(1);
    const b = tree.callers[0];
    expect(b.symbolId).toBe("B");
    expect(b.callers).toHaveLength(1);
    const c = b.callers[0];
    expect(c.symbolId).toBe("C");
    expect(c.callers).toHaveLength(0); // D excluded by maxDepth
  });

  it("marks recursive node and stops expansion on cycle", () => {
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "A", callee: "B" }, // mutual recursion: A → B → A
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 5);

    expect(tree.callers).toHaveLength(1);
    const b = tree.callers[0];
    expect(b.symbolId).toBe("B");
    expect(b.isRecursive).toBe(false);
    expect(b.callers).toHaveLength(1);

    const recursiveA = b.callers[0];
    expect(recursiveA.symbolId).toBe("A");
    expect(recursiveA.isRecursive).toBe(true);
    expect(recursiveA.callers).toHaveLength(0); // stops expanding
  });
});
