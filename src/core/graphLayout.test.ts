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

  it("includes both visual occurrences of a symbol in nodeIds when a recursive node reintroduces it", () => {
    // root appears at depth 0 AND depth 2 (recursive marker).
    // Both are distinct visual nodes and share the same file, so nodeIds contains "root" twice.
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
      sym({ id: "root", uri: "file:///src/core.ts" }),
      sym({ id: "B", uri: "file:///src/core.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    const group = layout.fileGroups.find((g) => g.file === "core.ts");
    expect(group).toBeDefined();
    expect(group!.nodeIds).toHaveLength(3); // root@depth0, B@depth1, root@depth2
    expect(group!.nodeIds.filter((id) => id === "root")).toHaveLength(2);
    expect(group!.nodeIds.filter((id) => id === "B")).toHaveLength(1);
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

  it("uses bare uri as file name when it contains no path separator", () => {
    // Exercises the false branch of fileNameFromUri (lastSlash < 0)
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 5, uri: "main.ts" })
    );

    const layout = layoutCallerGraph("root", [], metrics);

    expect(layout.nodes[0]!.file).toBe("main.ts");
  });

  it("produces empty file field when uri is an empty string", () => {
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 5, uri: "" })
    );

    const layout = layoutCallerGraph("root", [], metrics);

    expect(layout.nodes[0]!.file).toBe("");
  });

  it("produces empty file field when uri ends with a trailing slash", () => {
    // "file:///src/core/" — the segment after the last slash is ""
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 5, uri: "file:///src/core/" })
    );

    const layout = layoutCallerGraph("root", [], metrics);

    expect(layout.nodes[0]!.file).toBe("");
  });

  it("includes file name on each graph node", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "processOrder", f: 100, uri: "file:///src/orders/processor.ts" }),
      sym({ id: "B", name: "handleCheckout", f: 50, uri: "file:///src/checkout/handler.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    const root = layout.nodes.find((n) => n.id === "root" && n.depth === 0)!;
    const caller = layout.nodes.find((n) => n.id === "B")!;
    expect(root.file).toBe("processor.ts");
    expect(caller.file).toBe("handler.ts");
  });

  it("computes file groups for nodes sharing the same file", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
      { id: "C", depth: 1, recursive: false, children: [] },
      { id: "D", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 10, uri: "file:///src/core/main.ts" }),
      sym({ id: "B", name: "fnB", f: 20, uri: "file:///src/handlers/api.ts" }),
      sym({ id: "C", name: "fnC", f: 30, uri: "file:///src/handlers/api.ts" }),
      sym({ id: "D", name: "fnD", f: 40, uri: "file:///src/core/main.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.fileGroups).toHaveLength(2);

    const apiGroup = layout.fileGroups.find((g) => g.file === "api.ts");
    expect(apiGroup).toBeDefined();
    expect(apiGroup!.nodeIds).toContain("B");
    expect(apiGroup!.nodeIds).toContain("C");

    // B is at x=100, C at x=320, both at y=240 (depth 1, 3-node layer).
    // Bounding box = node positions ± FILE_GROUP_PADDING (30).
    expect(apiGroup!.x).toBe(70);        // 100 - 30
    expect(apiGroup!.y).toBe(210);       // 240 - 30
    expect(apiGroup!.width).toBe(280);   // (320-100) + 2*30
    expect(apiGroup!.height).toBe(60);   // 0 (same y) + 2*30

    // main.ts group spans root@depth0 (x=320,y=100) and D@depth1 (x=540,y=240).
    const mainGroup = layout.fileGroups.find((g) => g.file === "main.ts");
    expect(mainGroup).toBeDefined();
    expect(mainGroup!.x).toBe(290);      // 320 - 30
    expect(mainGroup!.y).toBe(70);       // 100 - 30
    expect(mainGroup!.width).toBe(280);  // (540-320) + 2*30
    expect(mainGroup!.height).toBe(200); // (240-100) + 2*30
  });

  it("produces no file groups when every file contains only one node", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
      { id: "C", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", name: "fn", f: 10, uri: "file:///src/a/alpha.ts" }),
      sym({ id: "B", name: "fnB", f: 20, uri: "file:///src/b/beta.ts" }),
      sym({ id: "C", name: "fnC", f: 30, uri: "file:///src/c/gamma.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.fileGroups).toHaveLength(0);
  });

  it("ignores nodes with no metrics when computing file groups", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
      { id: "C", depth: 1, recursive: false, children: [] },
    ];
    // "unknown" has no entry in the metrics map — its file will be ""
    const metrics = metricsMap(
      sym({ id: "B", name: "fnB", f: 20, uri: "file:///src/handlers/api.ts" }),
      sym({ id: "C", name: "fnC", f: 30, uri: "file:///src/handlers/api.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    // root has no metrics → file="" → skipped by computeFileGroups
    // B and C share api.ts → one group
    expect(layout.fileGroups).toHaveLength(1);
    expect(layout.fileGroups[0]!.file).toBe("api.ts");
    // The root node itself should have an empty file field
    const rootNode = layout.nodes.find((n) => n.id === "root")!;
    expect(rootNode.file).toBe("");
  });

  it("computes width and height from layout constants for a single-caller tree", () => {
    // maxLayerWidth=1 (1 node per layer), maxDepth=1
    // width  = PADDING*2 + (1-1)*NODE_SPACING_X = 100*2 + 0        = 200
    // height = PADDING*2 + 1*LAYER_SPACING_Y    = 100*2 + 1*140    = 340
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(sym({ id: "root" }), sym({ id: "B" }));

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.width).toBe(200);
    expect(layout.height).toBe(340);
  });

  it("computes width and height for a root-only graph", () => {
    // maxLayerWidth=1, maxDepth=0
    // width  = 100*2 + 0 = 200
    // height = 100*2 + 0 = 200
    const metrics = metricsMap(sym({ id: "root" }));

    const layout = layoutCallerGraph("root", [], metrics);

    expect(layout.width).toBe(200);
    expect(layout.height).toBe(200);
  });

  it("places a caller with depth 0 in the same layer as root and at a different x position", () => {
    // CallerNode.depth drives layer assignment directly — depth:0 merges with the root layer.
    const callers: CallerNode[] = [
      { id: "B", depth: 0, recursive: false, children: [] },
    ];
    const metrics = metricsMap(sym({ id: "root" }), sym({ id: "B" }));

    const layout = layoutCallerGraph("root", callers, metrics);

    const rootNode = layout.nodes.find((n) => n.id === "root" && n.depth === 0)!;
    const bNode = layout.nodes.find((n) => n.id === "B")!;
    expect(bNode.depth).toBe(0);
    expect(bNode.y).toBe(rootNode.y);   // same row
    expect(bNode.x).not.toBe(rootNode.x); // different column
  });

  it("produces exactly one file group when all nodes share the same file", () => {
    const callers: CallerNode[] = [
      { id: "B", depth: 1, recursive: false, children: [] },
      { id: "C", depth: 1, recursive: false, children: [] },
    ];
    const metrics = metricsMap(
      sym({ id: "root", uri: "file:///src/app.ts" }),
      sym({ id: "B", uri: "file:///src/app.ts" }),
      sym({ id: "C", uri: "file:///src/app.ts" })
    );

    const layout = layoutCallerGraph("root", callers, metrics);

    expect(layout.fileGroups).toHaveLength(1);
    const group = layout.fileGroups[0]!;
    expect(group.file).toBe("app.ts");
    expect(group.nodeIds).toHaveLength(3);
    expect(group.nodeIds).toContain("root");
    expect(group.nodeIds).toContain("B");
    expect(group.nodeIds).toContain("C");
  });
});
