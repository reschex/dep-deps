import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ────────────────────────────────────────────────────────
vi.mock("vscode", () => ({
  TreeItem: class {
    label: string;
    collapsibleState: number;
    description?: string;
    iconPath?: unknown;
    contextValue?: string;
    command?: unknown;
    tooltip?: unknown;
    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
  EventEmitter: class {
    fire = vi.fn();
    event = vi.fn();
  },
}));

import { ExtensionState } from "../extensionState";
import type { AnalysisResult } from "../analysisOrchestrator";
import { sym } from "../../../core/testFixtures";
import type { CallEdge } from "../../../core/rank";

function fakeAnalysis(
  symbols: AnalysisResult["symbols"],
  edges: CallEdge[]
): AnalysisResult {
  return { symbols, fileRollup: new Map(), edges, edgesCount: edges.length };
}

describe("ImpactTreeProvider", () => {
  let state: ExtensionState;

  beforeEach(() => {
    state = new ExtensionState();
  });

  it("shows empty message when no root symbol is set", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const provider = new ImpactTreeProvider(state);

    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      type: "empty",
      message: expect.stringContaining("Select a symbol"),
    });
  });

  it("shows direct callers as top-level nodes when root symbol is set", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "A" },
    ];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
          sym({ id: "C", name: "submitForm", f: 50 }),
        ],
        edges
      )
    );
    const provider = new ImpactTreeProvider(state);

    provider.setRootSymbol("A");
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ type: "caller", symbolId: "B", depth: 1, recursive: false });
    expect(children[1]).toMatchObject({ type: "caller", symbolId: "C", depth: 1, recursive: false });
  });

  it("lazy-loads children when expanding a caller node", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "B" },
    ];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
          sym({ id: "C", name: "apiRoute", f: 50.1 }),
        ],
        edges
      )
    );
    const provider = new ImpactTreeProvider(state);
    provider.setRootSymbol("A");

    // Get top-level callers
    const topLevel = await provider.getChildren();
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toMatchObject({ type: "caller", symbolId: "B", depth: 1 });

    // Expand B → should show C at depth 2
    const bChildren = await provider.getChildren(topLevel[0]!);
    expect(bChildren).toHaveLength(1);
    expect(bChildren[0]).toMatchObject({ type: "caller", symbolId: "C", depth: 2, recursive: false });
  });

  it("returns empty children when called with an empty-type node", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    state.setAnalysis(fakeAnalysis([sym({ id: "A", name: "main", f: 10 })], []));
    const provider = new ImpactTreeProvider(state);
    provider.setRootSymbol("A");
    const emptyNode = { type: "empty" as const, message: "No data" };

    const children = await provider.getChildren(emptyNode);
    expect(children).toEqual([]);
  });

  it("returns empty children for leaf nodes (no further callers)", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
        ],
        edges
      )
    );
    const provider = new ImpactTreeProvider(state);
    provider.setRootSymbol("A");

    const topLevel = await provider.getChildren();
    // B has no callers itself → expanding should return empty
    const bChildren = await provider.getChildren(topLevel[0]!);
    expect(bChildren).toHaveLength(0);
  });

  it("returns a recursive node at depth 1 when root symbol directly calls itself", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const edges: CallEdge[] = [{ caller: "A", callee: "A" }]; // self-edge
    state.setAnalysis(
      fakeAnalysis([sym({ id: "A", name: "recurse", f: 50 })], edges)
    );
    const provider = new ImpactTreeProvider(state);
    provider.setRootSymbol("A");

    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      type: "caller",
      symbolId: "A",
      depth: 1,
      recursive: true,
    });
    // Recursive node must not expand further
    const grandChildren = await provider.getChildren(children[0]!);
    expect(grandChildren).toEqual([]);
  });

  it("marks recursive nodes and stops expansion", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "A", callee: "B" },
    ];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processA", f: 20 }),
          sym({ id: "B", name: "processB", f: 10 }),
        ],
        edges
      )
    );
    const provider = new ImpactTreeProvider(state);
    provider.setRootSymbol("A");

    const topLevel = await provider.getChildren();
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toMatchObject({ type: "caller", symbolId: "B", depth: 1, recursive: false });

    // Expand B → should show A marked as recursive
    const bChildren = await provider.getChildren(topLevel[0]!);
    expect(bChildren).toHaveLength(1);
    expect(bChildren[0]).toMatchObject({ type: "caller", symbolId: "A", depth: 2, recursive: true });

    // Recursive nodes should have no children
    const recursiveChildren = await provider.getChildren(bChildren[0]!);
    expect(recursiveChildren).toHaveLength(0);
  });

  it("shows 'no analysis' message when root is set but analysis is not yet available", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    const provider = new ImpactTreeProvider(state);
    // state.lastAnalysis is undefined — no setAnalysis call
    provider.setRootSymbol("A");

    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      type: "empty",
      message: "No analysis results available",
    });
  });

  it("shows empty message when root symbol has no callers", async () => {
    const { ImpactTreeProvider } = await import("./impactTreeProvider");
    state.setAnalysis(
      fakeAnalysis([sym({ id: "A", name: "main", f: 10 })], [])
    );
    const provider = new ImpactTreeProvider(state);

    provider.setRootSymbol("A");
    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      type: "empty",
      message: expect.stringContaining("No code depends"),
    });
  });

  describe("getTreeItem", () => {
    it("formats caller node with symbol name, F score, and collapsible state", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processOrder", f: 100 }),
            sym({ id: "B", name: "handleCheckout", f: 189.2 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);

      expect(item.label).toBe("handleCheckout");
      expect(item.description).toContain("F=189.2");
      // Leaf node with no callers: should be Collapsed so VS Code asks for children
      expect(item.collapsibleState).toBe(1); // Collapsed
      expect(item.contextValue).toBe("ddpImpactCaller");
    });

    it("includes file name before the RECURSIVE tag in a recursive caller node description", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "A", callee: "B" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processA", f: 20, uri: "file:///src/orders/processor.ts" }),
            sym({ id: "B", name: "processB", f: 10, uri: "file:///src/checkout/handler.ts" }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const bChildren = await provider.getChildren(topLevel[0]!);
      const recursiveItem = provider.getTreeItem(bChildren[0]!);

      // Description format: "F=20.0 · processor.ts 🔄 RECURSIVE"
      expect(recursiveItem.description).toContain("processor.ts");
      expect(recursiveItem.description).toContain("RECURSIVE");
      // File suffix appears before the RECURSIVE tag
      const desc = recursiveItem.description as string;
      expect(desc.indexOf("processor.ts")).toBeLessThan(desc.indexOf("RECURSIVE"));
    });

    it("formats recursive caller node as non-collapsible with recursion icon", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "A", callee: "B" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processA", f: 20 }),
            sym({ id: "B", name: "processB", f: 10 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const bChildren = await provider.getChildren(topLevel[0]!);
      const recursiveItem = provider.getTreeItem(bChildren[0]!);

      expect(recursiveItem.label).toContain("processA");
      expect(recursiveItem.description).toContain("RECURSIVE");
      expect(recursiveItem.collapsibleState).toBe(0); // None — can't expand
    });

    it("shows symbol ID as fallback when metrics not found", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");

      const provider = new ImpactTreeProvider(state);
      const node = {
        type: "caller" as const,
        symbolId: "unknown-id",
        depth: 1,
        recursive: false,
        ancestors: new Set(["root"]),
      };
      const item = provider.getTreeItem(node);

      expect(item.label).toBe("unknown-id");
      expect(item.description).toContain("F=?");
    });

    it("shows readable filename#line:col when metrics not found and symbolId is a URI-based ID", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");

      const provider = new ImpactTreeProvider(state);
      const node = {
        type: "caller" as const,
        symbolId: "file:///c%3A/code/dep-deps/src/foo/bar.ts#42:4",
        depth: 1,
        recursive: false,
        ancestors: new Set(["root"]),
      };
      const item = provider.getTreeItem(node);

      expect(item.label).toBe("bar.ts#42:4");
      expect(item.description).toContain("F=?");
    });

    it("formats empty node with info icon", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);

      const item = provider.getTreeItem({ type: "empty", message: "No data" });

      expect(item.label).toBe("No data");
      expect(item.collapsibleState).toBe(0); // None
      expect(item.iconPath).toMatchObject({ id: "info" });
    });

    it("includes click-to-navigate command on caller nodes", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processOrder", f: 100 }),
            sym({ id: "B", name: "handleCheckout", f: 189.2 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);

      expect(item.command).toMatchObject({
        command: "ddp.revealSymbol",
        arguments: ["B"],
      });
    });

    it("shows full URI as file label when URI contains no slashes", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "root", f: 10 }),
            sym({ id: "B", name: "caller", f: 20, uri: "barefile.ts" }),
          ],
          [{ caller: "B", callee: "A" }]
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);
      // No slashes → fileNameFromUri returns the full URI as-is
      expect(item.description).toContain("barefile.ts");
    });

    it("shows no file suffix when URI ends with a trailing slash", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "root", f: 10 }),
            sym({ id: "B", name: "caller", f: 20, uri: "file:///src/module/" }),
          ],
          [{ caller: "B", callee: "A" }]
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);
      // Trailing slash → slice after last slash gives "" → no " · " suffix
      expect(item.description).toBe("F=20.0");
    });

    it("extracts file name from a Windows backslash URI", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "root", f: 10 }),
            sym({ id: "B", name: "caller", f: 30, uri: "C:\\src\\checkout\\handler.ts" }),
          ],
          [{ caller: "B", callee: "A" }]
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);
      expect(item.description).toContain("handler.ts");
    });

    it("includes file name in caller node description", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processOrder", f: 100, uri: "file:///src/orders/processor.ts" }),
            sym({ id: "B", name: "handleCheckout", f: 189.2, uri: "file:///src/checkout/handler.ts" }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const topLevel = await provider.getChildren();
      const item = provider.getTreeItem(topLevel[0]!);

      expect(item.description).toContain("handler.ts");
      expect(item.description).toContain("F=189.2");
    });
  });

  describe("re-root", () => {
    it("re-roots the tree when setRootSymbol is called with a different symbol", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "B" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processOrder", f: 100 }),
            sym({ id: "B", name: "handleCheckout", f: 189.2 }),
            sym({ id: "C", name: "apiRoute", f: 50.1 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);

      // Initially rooted at A: shows B
      provider.setRootSymbol("A");
      const firstRoot = await provider.getChildren();
      expect(firstRoot).toHaveLength(1);
      expect(firstRoot[0]).toMatchObject({ symbolId: "B" });

      // Re-root at B: shows C
      provider.setRootSymbol("B");
      const secondRoot = await provider.getChildren();
      expect(secondRoot).toHaveLength(1);
      expect(secondRoot[0]).toMatchObject({ symbolId: "C" });
    });

    it("exposes rootSymbolId for title display", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis(
          [sym({ id: "A", name: "processOrder", f: 100 })],
          []
        )
      );
      const provider = new ImpactTreeProvider(state);

      expect(provider.rootSymbolId).toBeUndefined();
      provider.setRootSymbol("A");
      expect(provider.rootSymbolId).toBe("A");
    });
  });

  describe("maxDepth", () => {
    it("returns empty children for any top-level node when maxDepth is 1", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "B" }, // C would be depth 2 — should never be shown
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "fnA", f: 100 }),
            sym({ id: "B", name: "fnB", f: 50 }),
            sym({ id: "C", name: "fnC", f: 20 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A", 1);

      const topLevel = await provider.getChildren();
      expect(topLevel).toHaveLength(1);
      expect(topLevel[0]).toMatchObject({ symbolId: "B", depth: 1 });

      // depth 1 >= maxDepth 1, so expanding B yields nothing
      const bChildren = await provider.getChildren(topLevel[0]!);
      expect(bChildren).toEqual([]);
    });

    it("respects maxDepth and stops expanding beyond it", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "B" },
        { caller: "D", callee: "C" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "fnA", f: 100 }),
            sym({ id: "B", name: "fnB", f: 50 }),
            sym({ id: "C", name: "fnC", f: 30 }),
            sym({ id: "D", name: "fnD", f: 10 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A", 2);

      const level1 = await provider.getChildren();
      expect(level1).toHaveLength(1);
      expect(level1[0]).toMatchObject({ symbolId: "B", depth: 1 });

      const level2 = await provider.getChildren(level1[0]!);
      expect(level2).toHaveLength(1);
      expect(level2[0]).toMatchObject({ symbolId: "C", depth: 2 });

      // Depth 2 = maxDepth, so expanding C should return empty
      const level3 = await provider.getChildren(level2[0]!);
      expect(level3).toHaveLength(0);
    });
  });

  describe("impact summary", () => {
    it("computes impact summary with direct callers, total affected, and combined F", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "A" },
        { caller: "D", callee: "B" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "processOrder", f: 100 }),
            sym({ id: "B", name: "handleCheckout", f: 189.2 }),
            sym({ id: "C", name: "submitForm", f: 50 }),
            sym({ id: "D", name: "apiRoute", f: 35 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const summary = provider.getImpactSummary();
      expect(summary).toBeDefined();
      expect(summary!.directCallers).toBe(2);
      expect(summary!.totalAffected).toBe(3); // B, C, D
      expect(summary!.combinedF).toBeCloseTo(189.2 + 50 + 35, 1);
    });

    it("returns undefined when no root symbol is set", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);
      expect(provider.getImpactSummary()).toBeUndefined();
    });

    it("returns undefined when root is set but no analysis is available", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);
      // state has no analysis (never called setAnalysis)
      provider.setRootSymbol("A");
      expect(provider.getImpactSummary()).toBeUndefined();
    });

    it("treats combinedF contribution as 0 for caller IDs not present in symbolById", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      // Edge references "ghost" symbol B which has no metrics entry
      const edges: CallEdge[] = [{ caller: "ghost-B", callee: "A" }];
      state.setAnalysis(
        fakeAnalysis(
          [sym({ id: "A", name: "processOrder", f: 100 })], // ghost-B has no metrics
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const summary = provider.getImpactSummary();
      expect(summary).toBeDefined();
      expect(summary!.directCallers).toBe(1);
      expect(summary!.totalAffected).toBe(1);
      expect(summary!.combinedF).toBe(0); // ghost-B metrics?.f ?? 0
    });

    it("returns zero counts for entry point (no callers)", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis([sym({ id: "A", name: "main", f: 10 })], [])
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const summary = provider.getImpactSummary();
      expect(summary).toMatchObject({
        directCallers: 0,
        totalAffected: 0,
        combinedF: 0,
      });
    });
  });

  describe("refresh", () => {
    it("fires change event when refresh is called", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);

      // We can verify refresh doesn't throw and the provider still works
      provider.refresh();
      const children = await provider.getChildren();
      expect(children).toHaveLength(1); // empty message
    });

    it("calls fire on the EventEmitter when refresh is invoked", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);
      const emitter = (provider as unknown as { _onDidChange: { fire: ReturnType<typeof vi.fn> } })._onDidChange;

      provider.refresh();

      expect(emitter.fire).toHaveBeenCalledTimes(1);
    });

    it("calls fire on the EventEmitter when setRootSymbol is invoked", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const provider = new ImpactTreeProvider(state);
      const emitter = (provider as unknown as { _onDidChange: { fire: ReturnType<typeof vi.fn> } })._onDidChange;

      provider.setRootSymbol("A");

      expect(emitter.fire).toHaveBeenCalledTimes(1);
    });
  });
});

describe("bugmagnet session 2026-04-29", () => {
  let state: ExtensionState;

  beforeEach(() => {
    state = new ExtensionState();
  });

  describe("getImpactSummary — diamond dependency graph", () => {
    it("returns correct totalAffected and combinedF when the same symbol is reachable via two paths (diamond graph)", async () => {
      // Diamond graph: D → B → A (root) and D → C → A (root)
      // D is reachable via two paths; it must be counted once in both totalAffected and combinedF.
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "A" },
        { caller: "D", callee: "B" },
        { caller: "D", callee: "C" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "core", f: 100 }),
            sym({ id: "B", name: "serviceB", f: 40 }),
            sym({ id: "C", name: "serviceC", f: 30 }),
            sym({ id: "D", name: "entryPoint", f: 20 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);
      provider.setRootSymbol("A");

      const summary = provider.getImpactSummary();
      expect(summary!.directCallers).toBe(2); // B and C
      expect(summary!.totalAffected).toBe(3); // B, C, D — each unique symbol once
      expect(summary!.combinedF).toBeCloseTo(40 + 30 + 20, 1); // 90
    });
  });

  describe("setRootSymbol — state transitions", () => {
    it("retains the new maxDepth when setRootSymbol is called a second time with a different depth", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      const edges: CallEdge[] = [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "B" },
        { caller: "D", callee: "C" },
      ];
      state.setAnalysis(
        fakeAnalysis(
          [
            sym({ id: "A", name: "fnA", f: 100 }),
            sym({ id: "B", name: "fnB", f: 50 }),
            sym({ id: "C", name: "fnC", f: 30 }),
            sym({ id: "D", name: "fnD", f: 10 }),
          ],
          edges
        )
      );
      const provider = new ImpactTreeProvider(state);

      // First call: maxDepth=3 — C should be reachable at depth 2
      provider.setRootSymbol("A", 3);
      const level1a = await provider.getChildren();
      const level2a = await provider.getChildren(level1a[0]!);
      expect(level2a[0]).toMatchObject({ symbolId: "C", depth: 2 });

      // Second call: maxDepth=1 — B at depth 1 should no longer expand
      provider.setRootSymbol("A", 1);
      const level1b = await provider.getChildren();
      const level2b = await provider.getChildren(level1b[0]!);
      expect(level2b).toEqual([]);
    });

    it("is idempotent when called twice with the same symbol ID", async () => {
      const { ImpactTreeProvider } = await import("./impactTreeProvider");
      state.setAnalysis(
        fakeAnalysis(
          [sym({ id: "A", name: "fn", f: 10 }), sym({ id: "B", name: "caller", f: 5 })],
          [{ caller: "B", callee: "A" }]
        )
      );
      const provider = new ImpactTreeProvider(state);

      provider.setRootSymbol("A");
      provider.setRootSymbol("A");

      expect(provider.rootSymbolId).toBe("A");
      const children = await provider.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0]).toMatchObject({ symbolId: "B" });
    });
  });
});
