import { describe, it, expect } from "vitest";
import { layoutCallerGraph } from "./graphLayout";
import type { CallerNode } from "./callerTree";
import { sym } from "./testFixtures";
import type { SymbolMetrics } from "./analyze";

function metricsMap(...entries: SymbolMetrics[]): ReadonlyMap<string, SymbolMetrics> {
  return new Map(entries.map((s) => [s.id, s]));
}

describe("layoutCallerGraph", () => {
  it("places root node at top center with a single caller below", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "processOrder", f: 100 }),
      sym({ id: "B", name: "handleCheckout", f: 189.2 })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.nodes).toHaveLength(2);

    const root = layout.nodes.find((n) => n.id === "root")!;
    const caller = layout.nodes.find((n) => n.id === "B")!;

    // Root is at depth 0, caller at depth 1
    expect(root.depth).toBe(0);
    expect(caller.depth).toBe(1);

    // Root is above caller (lower y = higher visually)
    expect(root.y).toBeLessThan(caller.y);

    // Both horizontally centered (same x when one node per level)
    expect(root.x).toBe(caller.x);

    // Labels pulled from metrics
    expect(root.label).toBe("processOrder");
    expect(caller.label).toBe("handleCheckout");

    // F scores
    expect(root.f).toBe(100);
    expect(caller.f).toBe(189.2);

    // One edge from caller → root
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({ from: "B", to: "root" });
  });

  it("spaces multiple callers horizontally at the same depth", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
      { id: "C", depth: 1, recursive: false, children: [] },
      { id: "D", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 10 }),
      sym({ id: "B", name: "fnB", f: 20 }),
      sym({ id: "C", name: "fnC", f: 30 }),
      sym({ id: "D", name: "fnD", f: 40 })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.nodes).toHaveLength(4);

    const depthOneNodes = layout.nodes.filter((n) => n.depth === 1);
    expect(depthOneNodes).toHaveLength(3);

    // All at same y
    const ys = depthOneNodes.map((n) => n.y);
    expect(new Set(ys).size).toBe(1);

    // Different x positions, sorted left to right
    const xs = depthOneNodes.map((n) => n.x);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
  });

  it("handles multi-level tree with edges at each level", () => {
    const callers: CallerNode[] = [
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "C", depth: 2, recursive: false, children: [] },
        ],
      },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 10 }),
      sym({ id: "B", name: "fnB", f: 20 }),
      sym({ id: "C", name: "fnC", f: 30 })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges).toContainEqual({ from: "B", to: "root" });
    expect(layout.edges).toContainEqual({ from: "C", to: "B" });

    const nodeC = layout.nodes.find((n) => n.id === "C")!;
    const nodeB = layout.nodes.find((n) => n.id === "B")!;
    const nodeRoot = layout.nodes.find((n) => n.id === "root")!;
    expect(nodeRoot.y).toBeLessThan(nodeB.y);
    expect(nodeB.y).toBeLessThan(nodeC.y);
  });

  it("marks recursive nodes", () => {
    const callers: CallerNode[] = [
      {
        id: "B",
        depth: 1,
        recursive: false,
        children: [
          { id: "root", depth: 2, recursive: true, children: [] },
        ],
      },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "processA", f: 20 }),
      sym({ id: "B", name: "processB", f: 10 })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    const recursiveNode = layout.nodes.find((n) => n.id === "root" && n.depth === 2);
    expect(recursiveNode).toBeDefined();
    expect(recursiveNode!.recursive).toBe(true);
  });

  it("uses symbol ID as label when metrics are missing", () => {
    const callers: CallerNode[] = [
      { id: "unknown-sym", depth: 1, recursive: false, children: [] },
    ];

    const layout = layoutCallerGraph("root", callers, new Map());

    const unknown = layout.nodes.find((n) => n.id === "unknown-sym")!;
    expect(unknown.label).toBe("unknown-sym");
    expect(unknown.f).toBe(0);
  });

  it("returns empty callers graph with just the root", () => {
    const metrics = metricsMap(sym({ id: "root", name: "main", f: 5 }));
    const layout = layoutCallerGraph("root", [], metrics);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]!.id).toBe("root");
    expect(layout.edges).toHaveLength(0);
  });
});
