import { describe, it, expect } from "vitest";
import { directCallersOf, callerTree, impactSummary, flattenTree, type CallerNode } from "./callerTree";
import type { CallEdge } from "./rank";
import type { SymbolMetrics } from "./analyze";
import { sym } from "./testFixtures";

describe("directCallersOf", () => {
  it("returns symbol IDs of direct callers", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "B" },
      { caller: "B", callee: "C" },
    ];
    expect(directCallersOf("C", edges)).toEqual(["B"]);
  });
});

describe("callerTree", () => {
  it("builds multi-level caller tree", () => {
    const edges: CallEdge[] = [
      { caller: "userAction", callee: "handleOrder" },
      { caller: "handleOrder", callee: "processOrder" },
      { caller: "processOrder", callee: "validateOrder" },
    ];
    const tree = callerTree("validateOrder", edges, 3);
    expect(tree).toEqual<CallerNode[]>([
      {
        id: "processOrder",
        depth: 1,
        recursive: false,
        children: [
          {
            id: "handleOrder",
            depth: 2,
            recursive: false,
            children: [
              { id: "userAction", depth: 3, recursive: false, children: [] },
            ],
          },
        ],
      },
    ]);
  });

  it("detects mutual recursion and stops expanding", () => {
    const edges: CallEdge[] = [
      { caller: "processB", callee: "processA" },
      { caller: "processA", callee: "processB" },
    ];
    const tree = callerTree("processA", edges, 5);
    expect(tree).toEqual<CallerNode[]>([
      {
        id: "processB",
        depth: 1,
        recursive: false,
        children: [
          { id: "processA", depth: 2, recursive: true, children: [] },
        ],
      },
    ]);
  });

  it("respects maxDepth and stops expanding beyond it", () => {
    const edges: CallEdge[] = [
      { caller: "D", callee: "C" },
      { caller: "C", callee: "B" },
      { caller: "B", callee: "A" },
    ];
    const tree = callerTree("A", edges, 2);
    expect(tree).toEqual<CallerNode[]>([
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "C", depth: 2, recursive: false, children: [] },
        ],
      },
    ]);
  });

  it("returns empty array when symbol has no callers", () => {
    const edges: CallEdge[] = [{ caller: "A", callee: "B" }];
    expect(callerTree("A", edges, 3)).toEqual([]);
  });
});

describe("impactSummary", () => {
  it("counts direct callers and total affected from tree", () => {
    const tree: CallerNode[] = [
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "C", depth: 2, recursive: false, children: [] },
        ],
      },
    ];
    const summary = impactSummary(tree);
    expect(summary.directCallers).toBe(1);
    expect(summary.totalAffected).toBe(2);
  });

  it("returns zeros for empty tree (entry point)", () => {
    const summary = impactSummary([]);
    expect(summary.directCallers).toBe(0);
    expect(summary.totalAffected).toBe(0);
  });
});

describe("flattenTree", () => {
  it("flattens caller tree into label/description items with indentation", () => {
    const tree: CallerNode[] = [
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "C", depth: 2, recursive: false, children: [] },
        ],
      },
    ];
    const metricsById = new Map<string, SymbolMetrics>([
      ["B", sym({ id: "B", name: "handleCheckout", f: 189.2 })],
      ["C", sym({ id: "C", name: "POST /api/checkout", f: 50.1 })],
    ]);
    const items = flattenTree(tree, metricsById);
    expect(items).toEqual([
      { id: "B", label: "handleCheckout", description: "F=189.2 (depth 1)" },
      { id: "C", label: "$(indent)POST /api/checkout", description: "F=50.1 (depth 2)" },
    ]);
  });

  it("marks recursive nodes", () => {
    const tree: CallerNode[] = [
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "A", depth: 2, recursive: true, children: [] },
        ],
      },
    ];
    const metricsById = new Map<string, SymbolMetrics>([
      ["B", sym({ id: "B", name: "processB", f: 10 })],
      ["A", sym({ id: "A", name: "processA", f: 20 })],
    ]);
    const items = flattenTree(tree, metricsById);
    expect(items[1]!.description).toContain("RECURSIVE");
  });

  it("uses id as label when metrics not found", () => {
    const tree: CallerNode[] = [
      { id: "unknown-id", depth: 1, recursive: false, children: [] },
    ];
    const items = flattenTree(tree, new Map());
    expect(items).toEqual([
      { id: "unknown-id", label: "unknown-id", description: "F=? (depth 1)" },
    ]);
  });
});
