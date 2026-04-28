import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SymbolMetrics } from "../../../core/analyze";
import type { AnalysisResult } from "../analysisOrchestrator";

// ── vscode mock (factory must be self-contained — vi.mock is hoisted) ─
vi.mock("vscode", () => {
  class TreeItem {
    label: string;
    collapsibleState: number;
    description?: string;
    iconPath?: unknown;
    tooltip?: unknown;
    command?: unknown;
    contextValue?: string;
    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }
  class ThemeIcon {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  }
  class MarkdownString {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
  }
  class EventEmitter<T> {
    private readonly listeners: Array<(e: T) => void> = [];
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data?: T): void {
      for (const l of this.listeners) l(data as T);
    }
  }
  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon,
    MarkdownString,
    EventEmitter,
    Uri: {
      parse(uri: string) {
        try {
          const url = new URL(uri);
          return { fsPath: decodeURIComponent(url.pathname) };
        } catch {
          return { fsPath: uri };
        }
      },
    },
  };
});

import { RiskTreeProvider, type RiskNode } from "./riskTreeProvider";
import { ExtensionState } from "../extensionState";
import { sym } from "../../../core/testFixtures";

function analysis(symbols: SymbolMetrics[]): AnalysisResult {
  return { symbols, fileRollup: new Map(), edges: [], edgesCount: 0 };
}

/** Filter root children to only file nodes (skip the single scope node). */
function fileRoots(nodes: RiskNode[]): RiskNode[] {
  return nodes.filter((n) => n.type !== "scope");
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("RiskTreeProvider", () => {
  let state: ExtensionState;
  let provider: RiskTreeProvider;

  beforeEach(() => {
    state = new ExtensionState();
    provider = new RiskTreeProvider(state);
  });

  // ─── getChildren: empty / no analysis ──────────────────────────────

  describe("getChildren", () => {
    it("returns empty-message node when no analysis exists", async () => {
      const children = await provider.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe("empty");
      if (children[0].type === "empty") {
        expect(children[0].message).toContain("Analyze workspace");
      }
    });

    it("returns empty array when element is provided but no analysis exists", async () => {
      const children = await provider.getChildren({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(children).toEqual([]);
    });

    it("returns empty-message node when analysis has empty symbols array", async () => {
      state.setAnalysis(analysis([]));
      const children = await provider.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe("empty");
    });

    it("returns file nodes sorted by max F descending", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a1", uri: "file:///a.ts", f: 5 }),
          sym({ id: "b1", uri: "file:///b.ts", f: 20 }),
          sym({ id: "c1", uri: "file:///c.ts", f: 10 }),
        ])
      );
      const children = fileRoots(await provider.getChildren());
      expect(children.map((c) => (c as { uri: string }).uri)).toEqual([
        "file:///b.ts",
        "file:///c.ts",
        "file:///a.ts",
      ]);
    });

    it("groups multiple symbols under the same file node", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a1", uri: "file:///a.ts", f: 5 }),
          sym({ id: "a2", uri: "file:///a.ts", f: 15 }),
        ])
      );
      const roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(1);
      expect(roots[0].type).toBe("file");

      const children = await provider.getChildren(roots[0]);
      expect(children).toHaveLength(2);
      // Sorted by F descending
      expect((children[0] as { type: "symbol"; symbol: SymbolMetrics }).symbol.f).toBe(15);
      expect((children[1] as { type: "symbol"; symbol: SymbolMetrics }).symbol.f).toBe(5);
    });

    it("returns symbol nodes for a file element sorted by F descending", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "x", uri: "file:///f.ts", f: 3 }),
          sym({ id: "y", uri: "file:///f.ts", f: 12 }),
          sym({ id: "z", uri: "file:///f.ts", f: 7 }),
        ])
      );
      const children = await provider.getChildren({ type: "file", uri: "file:///f.ts", label: "f.ts" });
      expect(children.map((c) => (c as { type: "symbol"; symbol: SymbolMetrics }).symbol.id)).toEqual([
        "y",
        "z",
        "x",
      ]);
    });

    it("returns empty array for a symbol element", async () => {
      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]));
      const children = await provider.getChildren({ type: "symbol", symbol: sym({ id: "a" }) });
      expect(children).toEqual([]);
    });

    it("returns empty array for an empty element", async () => {
      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]));
      const children = await provider.getChildren({ type: "empty", message: "test" });
      expect(children).toEqual([]);
    });

    it("extracts filename from URI as label for file nodes", async () => {
      state.setAnalysis(analysis([sym({ id: "a", uri: "file:///path/to/deep/module.ts", f: 1 })]));
      const roots = fileRoots(await provider.getChildren());
      expect(roots[0].type).toBe("file");
      if (roots[0].type === "file") {
        expect(roots[0].label).toBe("module.ts");
      }
    });

    it("sorts files correctly when multiple symbols per file have different F", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a1", uri: "file:///a.ts", f: 1 }),
          sym({ id: "a2", uri: "file:///a.ts", f: 100 }),
          sym({ id: "b1", uri: "file:///b.ts", f: 50 }),
        ])
      );
      const roots = fileRoots(await provider.getChildren());
      // file a.ts has max F=100, file b.ts has max F=50
      expect((roots[0] as { uri: string }).uri).toBe("file:///a.ts");
      expect((roots[1] as { uri: string }).uri).toBe("file:///b.ts");
    });
  });

  // ─── getTreeItem ───────────────────────────────────────────────────

  describe("getTreeItem", () => {
    it("returns info TreeItem for empty node", () => {
      const item = provider.getTreeItem({ type: "empty", message: "Nothing here" });
      expect(item.label).toBe("Nothing here");
      expect(item.collapsibleState).toBe(0); // None
      expect((item.iconPath as FakeThemeIcon).id).toBe("info");
    });

    it("returns expanded TreeItem for file node with correct description", () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a1", uri: "file:///x.ts", f: 42.7 }),
          sym({ id: "a2", uri: "file:///x.ts", f: 10.3 }),
        ])
      );
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.label).toBe("x.ts");
      expect(item.collapsibleState).toBe(2); // Expanded
      expect(item.description).toBe("max F≈43");
      expect((item.iconPath as FakeThemeIcon).id).toBe("file-code");
      expect(item.contextValue).toBe("ddpFile");
    });

    it("returns non-collapsible TreeItem for symbol node with formatted metrics", () => {
      const s = sym({ id: "myFunc", name: "myFunc", f: 12.34, r: 0.567, cc: 5, t: 0.8, crap: 6.78 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.label).toBe("myFunc");
      expect(item.collapsibleState).toBe(0); // None
      expect(item.description).toBe("F=12.3  R=0.57  CC=5  T=80%");
    });

    it("sets tooltip as MarkdownString for symbol node", () => {
      const s = sym({ id: "fn", name: "fn", f: 5.678, r: 1.234, crap: 4.567 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      const tooltip = item.tooltip as FakeMarkdownString;
      expect(tooltip.value).toContain("**fn**");
      expect(tooltip.value).toContain("R=1.234");
      expect(tooltip.value).toContain("CRAP=4.57");
      expect(tooltip.value).toContain("F=5.68");
    });

    it("sets command to ddp.riskView.openFile with parsed Uri for file node", () => {
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.command).toEqual({
        command: "ddp.riskView.openFile",
        title: "Open file",
        arguments: [{ fsPath: "/x.ts" }],
      });
    });

    it("sets command argument to parsed Uri for file node with empty URI", () => {
      const item = provider.getTreeItem({ type: "file", uri: "", label: "unknown" });
      expect((item.command as any).arguments?.[0]).toEqual({ fsPath: "" });
    });

    it("sets command to ddp.revealSymbol with symbol id", () => {
      const s = sym({ id: "sym-123", name: "handler" });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.command).toEqual({
        command: "ddp.revealSymbol",
        title: "Reveal symbol",
        arguments: ["sym-123"],
      });
    });

    it("returns max F≈0 for file node when no symbols match the URI", () => {
      state.setAnalysis(analysis([sym({ id: "a", uri: "file:///other.ts", f: 99 })]));
      const item = provider.getTreeItem({ type: "file", uri: "file:///missing.ts", label: "missing.ts" });
      expect(item.description).toBe("max F≈0");
    });

    it("returns max F≈0 for file node when analysis is undefined", () => {
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.description).toBe("max F≈0");
    });
  });

  // ─── refresh ───────────────────────────────────────────────────────

  describe("refresh", () => {
    it("fires onDidChangeTreeData event", () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);
      provider.refresh();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ─── Numeric edge cases ────────────────────────────────────────────

  describe("numeric edge cases", () => {
    it("formats F=0 correctly in symbol description", () => {
      const s = sym({ id: "a", f: 0, r: 0, cc: 0, t: 0 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.description).toBe("F=0.0  R=0.00  CC=0  T=0%");
    });

    it("formats very large F correctly in symbol description", () => {
      const s = sym({ id: "a", f: 99999.99, r: 50.123, cc: 100, t: 1 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.description).toBe("F=100000.0  R=50.12  CC=100  T=100%");
    });

    it("formats negative F values in symbol description", () => {
      // Negative F shouldn't normally happen but we test the formatting
      const s = sym({ id: "a", f: -3.5, r: -0.1, cc: 1, t: 0 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.description).toBe("F=-3.5  R=-0.10  CC=1  T=0%");
    });

    it("formats very small fractional values", () => {
      const s = sym({ id: "a", f: 0.001, r: 0.0001, cc: 1, t: 0.001 });
      const item = provider.getTreeItem({ type: "symbol", symbol: s });
      expect(item.description).toBe("F=0.0  R=0.00  CC=1  T=0%");
    });

    it("max F in file description rounds correctly", () => {
      state.setAnalysis(analysis([sym({ id: "a", uri: "file:///x.ts", f: 0.5 })]));
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.description).toBe("max F≈1");
    });

    it("max F in file description handles exact integer", () => {
      state.setAnalysis(analysis([sym({ id: "a", uri: "file:///x.ts", f: 10 })]));
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.description).toBe("max F≈10");
    });
  });

  // ─── State transitions ─────────────────────────────────────────────

  describe("state transitions", () => {
    it("switches from empty to file nodes after analysis is set", async () => {
      let children = await provider.getChildren();
      expect(children[0].type).toBe("empty");

      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]));
      children = fileRoots(await provider.getChildren());
      expect(children[0].type).toBe("file");
    });

    it("switches back to empty when analysis is cleared", async () => {
      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]));
      let children = fileRoots(await provider.getChildren());
      expect(children[0].type).toBe("file");

      state.setAnalysis(undefined);
      children = await provider.getChildren();
      expect(children[0].type).toBe("empty");
    });

    it("updates tree data when analysis changes", async () => {
      state.setAnalysis(analysis([sym({ id: "a", uri: "file:///a.ts", f: 5 })]));
      let roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(1);

      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///a.ts", f: 5 }),
          sym({ id: "b", uri: "file:///b.ts", f: 10 }),
        ])
      );
      roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(2);
    });
  });

  // ─── Single symbol ─────────────────────────────────────────────────

  describe("single symbol scenario", () => {
    it("produces correct tree structure for one symbol", async () => {
      const s = sym({ id: "only", uri: "file:///solo.ts", name: "soloFn", f: 7.5 });
      state.setAnalysis(analysis([s]));

      const roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(1);
      expect(roots[0].type).toBe("file");
      if (roots[0].type === "file") {
        expect(roots[0].label).toBe("solo.ts");
      }

      const symbols = await provider.getChildren(roots[0]);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].type).toBe("symbol");
    });
  });

  // ─── Many files / symbols ──────────────────────────────────────────

  describe("many files and symbols", () => {
    it("handles 100 files correctly", async () => {
      const symbols = Array.from({ length: 100 }, (_, i) =>
        sym({ id: `s${i}`, uri: `file:///f${i}.ts`, f: i })
      );
      state.setAnalysis(analysis(symbols));

      const roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(100);
      // First file should have highest F
      expect((roots[0] as { uri: string }).uri).toBe("file:///f99.ts");
      expect((roots[99] as { uri: string }).uri).toBe("file:///f0.ts");
    });
  });

  // ─── Equal F values ────────────────────────────────────────────────

  describe("equal F values", () => {
    it("handles files with identical max F values", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///a.ts", f: 10 }),
          sym({ id: "b", uri: "file:///b.ts", f: 10 }),
        ])
      );
      const roots = fileRoots(await provider.getChildren());
      expect(roots).toHaveLength(2);
      // Both present, order doesn't matter for equal F
      const uris = roots.map((r) => (r as { uri: string }).uri).sort((a, b) => a.localeCompare(b));
      expect(uris).toEqual(["file:///a.ts", "file:///b.ts"]);
    });

    it("handles symbols with identical F values within a file", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "x", uri: "file:///a.ts", f: 5, name: "funcX" }),
          sym({ id: "y", uri: "file:///a.ts", f: 5, name: "funcY" }),
        ])
      );
      const children = await provider.getChildren({ type: "file", uri: "file:///a.ts", label: "a.ts" });
      expect(children).toHaveLength(2);
    });
  });

  // ─── bugmagnet session 2026-04-15 ──────────────────────────────────

  describe("bugmagnet session 2026-04-15", () => {
    // ── Complex interactions ────────────────────────────────────────

    describe("complex interactions", () => {
      it("returns correct children after multiple rapid analysis changes", async () => {
        state.setAnalysis(analysis([sym({ id: "a", uri: "file:///a.ts", f: 1 })]));
        state.setAnalysis(analysis([sym({ id: "b", uri: "file:///b.ts", f: 2 })]));
        state.setAnalysis(
          analysis([
            sym({ id: "c", uri: "file:///c.ts", f: 3 }),
            sym({ id: "d", uri: "file:///d.ts", f: 4 }),
          ])
        );
        const roots = fileRoots(await provider.getChildren());
        expect(roots).toHaveLength(2);
        expect((roots[0] as { uri: string }).uri).toBe("file:///d.ts");
      });

      it("refresh followed by getChildren returns fresh data", async () => {
        state.setAnalysis(analysis([sym({ id: "a", uri: "file:///a.ts", f: 1 })]));
        let roots = fileRoots(await provider.getChildren());
        expect(roots).toHaveLength(1);

        state.setAnalysis(
          analysis([
            sym({ id: "a", uri: "file:///a.ts", f: 1 }),
            sym({ id: "b", uri: "file:///b.ts", f: 2 }),
          ])
        );
        provider.refresh();
        roots = fileRoots(await provider.getChildren());
        expect(roots).toHaveLength(2);
      });

      it("getTreeItem for file with many symbols picks correct max F", () => {
        const symbols = Array.from({ length: 50 }, (_, i) =>
          sym({ id: `s${i}`, uri: "file:///big.ts", f: i * 2 })
        );
        state.setAnalysis(analysis(symbols));
        const item = provider.getTreeItem({ type: "file", uri: "file:///big.ts", label: "big.ts" });
        // max F should be 49 * 2 = 98
        expect(item.description).toBe("max F≈98");
      });
    });

    // ── Error handling / edge inputs ────────────────────────────────

    describe("edge inputs", () => {
      it("returns empty array for file element with URI not in analysis", async () => {
        state.setAnalysis(analysis([sym({ id: "a", uri: "file:///exists.ts", f: 5 })]));
        const children = await provider.getChildren({
          type: "file",
          uri: "file:///nonexistent.ts",
          label: "nonexistent.ts",
        });
        expect(children).toEqual([]);
      });

      it("handles symbol with empty name", () => {
        const s = sym({ id: "empty-name", name: "", f: 5, r: 1, cc: 2, t: 0.5, crap: 3 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.label).toBe("");
        expect(item.description).toContain("F=5.0");
      });

      it("handles symbol with special characters in name", () => {
        const s = sym({ id: "special", name: "<init>$1", f: 5, r: 1, cc: 2, t: 0.5, crap: 3 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.label).toBe("<init>$1");
      });

      it("handles symbol with very long name", () => {
        const longName = "a".repeat(500);
        const s = sym({ id: "long", name: longName, f: 5, r: 1, cc: 2, t: 0.5, crap: 3 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.label).toBe(longName);
      });

      it("handles file label with unicode characters", () => {
        state.setAnalysis(analysis([sym({ id: "u", uri: "file:///mödüle.ts", f: 1 })]));
        const item = provider.getTreeItem({
          type: "file",
          uri: "file:///mödüle.ts",
          label: "mödüle.ts",
        });
        expect(item.label).toBe("mödüle.ts");
      });
    });

    // ── Numeric edge cases (advanced) ───────────────────────────────

    describe("numeric edge cases (advanced)", () => {
      it("handles NaN F value in symbol description", () => {
        const s = sym({ id: "nan", f: Number.NaN, r: Number.NaN, cc: 0, t: 0, crap: Number.NaN });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.description).toBe("F=NaN  R=NaN  CC=0  T=0%");
      });

      it("handles Infinity F value in symbol description", () => {
        const s = sym({ id: "inf", f: Infinity, r: Infinity, cc: 1, t: 0, crap: Infinity });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.description).toBe("F=Infinity  R=Infinity  CC=1  T=0%");
      });

      it("handles -0 values", () => {
        const s = sym({ id: "negzero", f: -0, r: -0, cc: 0, t: -0, crap: -0 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.description).toBe("F=0.0  R=0.00  CC=0  T=0%");
      });

      it("handles T=1 (100% coverage) in symbol description", () => {
        const s = sym({ id: "full", f: 5, r: 1, cc: 5, t: 1, crap: 5 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.description).toContain("T=100%");
      });

      it("handles T slightly over 1 due to floating point", () => {
        const s = sym({ id: "over", f: 5, r: 1, cc: 5, t: 1.0000001, crap: 5 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        // 1.0000001 * 100 = 100.00001, toFixed(0) = "100"
        expect(item.description).toContain("T=100%");
      });

      it("file maxF calculation uses 0 as floor when no symbols match", () => {
        state.setAnalysis(analysis([sym({ id: "a", uri: "file:///other.ts", f: -10 })]));
        const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
        // Math.max(0, ...empty) = 0
        expect(item.description).toBe("max F≈0");
      });

      it("file maxF uses 0 as floor even when all symbols have negative F", () => {
        state.setAnalysis(
          analysis([
            sym({ id: "a", uri: "file:///x.ts", f: -5 }),
            sym({ id: "b", uri: "file:///x.ts", f: -1 }),
          ])
        );
        const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
        // Math.max(0, -5, -1) = 0
        expect(item.description).toBe("max F≈0");
      });
    });

    // ── String edge cases (URIs) ────────────────────────────────────

    describe("URI and path edge cases", () => {
      it("extracts filename from deeply nested URI path", async () => {
        state.setAnalysis(
          analysis([sym({ id: "deep", uri: "file:///a/b/c/d/e/f/g/deep.ts", f: 1 })])
        );
        const roots = await provider.getChildren();
        if (roots[0].type === "file") {
          expect(roots[0].label).toBe("deep.ts");
        }
      });

      it("extracts filename from URI with backslash-style path", async () => {
        // On Windows, fsPath could have backslashes
        state.setAnalysis(
          analysis([sym({ id: "win", uri: "file:///C:/Users/test/project/file.ts", f: 1 })])
        );
        const roots = await provider.getChildren();
        if (roots[0].type === "file") {
          expect(roots[0].label).toBe("file.ts");
        }
      });

      it("handles URI with encoded characters", async () => {
        state.setAnalysis(
          analysis([sym({ id: "enc", uri: "file:///path/to/my%20file.ts", f: 1 })])
        );
        const roots = fileRoots(await provider.getChildren());
        expect(roots[0].type).toBe("file");
        if (roots[0].type === "file") {
          // The label should be the decoded filename
          expect(roots[0].label).toBe("my file.ts");
        }
      });
    });

    // ── Stateful operations ─────────────────────────────────────────

    describe("stateful operations", () => {
      it("calling refresh multiple times does not break getChildren", async () => {
        state.setAnalysis(analysis([sym({ id: "a", f: 1 })]));
        provider.refresh();
        provider.refresh();
        provider.refresh();
        const roots = fileRoots(await provider.getChildren());
        expect(roots).toHaveLength(1);
        expect(roots[0].type).toBe("file");
      });

      it("calling getChildren multiple times returns consistent results", async () => {
        state.setAnalysis(
          analysis([
            sym({ id: "a", uri: "file:///a.ts", f: 10 }),
            sym({ id: "b", uri: "file:///b.ts", f: 5 }),
          ])
        );
        const first = await provider.getChildren();
        const second = await provider.getChildren();
        expect(first.map((r) => (r as { uri: string }).uri)).toEqual(
          second.map((r) => (r as { uri: string }).uri)
        );
      });

      it("getTreeItem is idempotent for the same node", () => {
        const s = sym({ id: "x", name: "fn", f: 5, r: 1, cc: 2, t: 0.5, crap: 3 });
        const node = { type: "symbol" as const, symbol: s };
        const item1 = provider.getTreeItem(node);
        const item2 = provider.getTreeItem(node);
        expect(item1.description).toBe(item2.description);
        expect(item1.label).toBe(item2.label);
      });
    });

    // ── Tooltip content ─────────────────────────────────────────────

    describe("tooltip content", () => {
      it("tooltip contains all three metric values", () => {
        const s = sym({ id: "t", name: "myFn", r: 2.345, crap: 12.34, f: 28.5 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        const tooltip = item.tooltip as { value: string };
        expect(tooltip.value).toContain("R=2.345");
        expect(tooltip.value).toContain("CRAP=12.34");
        expect(tooltip.value).toContain("F=28.50");
      });

      it("tooltip contains bold name", () => {
        const s = sym({ id: "t", name: "processData" });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        const tooltip = item.tooltip as { value: string };
        expect(tooltip.value).toContain("**processData**");
      });
    });

    // ── Violated domain constraints ─────────────────────────────────

    describe("violated domain constraints", () => {
      it("handles duplicate symbol IDs in the same file", async () => {
        state.setAnalysis(
          analysis([
            sym({ id: "dup", uri: "file:///a.ts", f: 5, name: "fn1" }),
            sym({ id: "dup", uri: "file:///a.ts", f: 10, name: "fn2" }),
          ])
        );
        const roots = fileRoots(await provider.getChildren());
        expect(roots).toHaveLength(1);
        const children = await provider.getChildren(roots[0]);
        // Both symbols should appear even with duplicate IDs
        expect(children).toHaveLength(2);
      });

      it("handles symbol with empty URI", async () => {
        state.setAnalysis(analysis([sym({ id: "empty-uri", uri: "", f: 5 })]));
        const roots = fileRoots(await provider.getChildren());
        // Should still produce a file node
        expect(roots).toHaveLength(1);
        expect(roots[0].type).toBe("file");
      });

      it("handles symbol with empty ID", () => {
        const s = sym({ id: "", name: "fn", f: 5 });
        const item = provider.getTreeItem({ type: "symbol", symbol: s });
        expect(item.command).toEqual({
          command: "ddp.revealSymbol",
          title: "Reveal symbol",
          arguments: [""],
        });
      });
    });
  });

  // ─── Scope context ─────────────────────────────────────────────────

  describe("scope context", () => {
    it("includes a scope node as first root when analysis exists", async () => {
      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]));
      const roots = await provider.getChildren();
      expect(roots[0].type).toBe("scope");
      if (roots[0].type === "scope") {
        expect(roots[0].label).toBe("workspace");
      }
      expect(fileRoots(roots)).toHaveLength(roots.length - 1);
    });

    it("renders scope node with root-folder icon and non-collapsible state", () => {
      const item = provider.getTreeItem({ type: "scope", label: "workspace" });
      expect(item.label).toBe("workspace");
      expect(item.collapsibleState).toBe(0); // None
      expect((item.iconPath as FakeThemeIcon).id).toBe("root-folder");
      expect(item.contextValue).toBe("ddpScope");
    });

    it("does not include a scope node when no analysis exists", async () => {
      const roots = await provider.getChildren();
      expect(roots.every((n) => n.type !== "scope")).toBe(true);
    });

    it("scope node shows decoded folder path when analysis has a folder scope", async () => {
      state.setAnalysis(analysis([sym({ id: "a", f: 5 })]), {
        rootUri: "file:///c%3A/code/myProject/src",
      });
      const roots = await provider.getChildren();
      const scopeNode = roots.find((n) => n.type === "scope");
      expect(scopeNode).toBeDefined();
      // URI is decoded to a human-readable filesystem path
      expect((scopeNode as { label: string }).label).toBe("/c:/code/myProject/src");
    });
  });

  // ─── Sorting ─────────────────────────────────────────────────────

  describe("sorting", () => {
    it("file description shows F′ label when sort field is fPrime", () => {
      state.setAnalysis(
        analysis([sym({ id: "a", uri: "file:///x.ts", fPrime: 42.7 })])
      );
      provider.setSortField("fPrime");
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.description).toBe("max F′≈43");
    });

    it("file description shows G label when sort field is g", () => {
      state.setAnalysis(
        analysis([sym({ id: "a", uri: "file:///x.ts", g: 2.5 })])
      );
      provider.setSortField("g");
      const item = provider.getTreeItem({ type: "file", uri: "file:///x.ts", label: "x.ts" });
      expect(item.description).toBe("max G≈3");
    });

    it("sorts file nodes by max fPrime descending when sort field is fPrime", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///a.ts", fPrime: 5, f: 100 }),
          sym({ id: "b", uri: "file:///b.ts", fPrime: 30, f: 1 }),
          sym({ id: "c", uri: "file:///c.ts", fPrime: 12, f: 50 }),
        ])
      );
      provider.setSortField("fPrime");
      const roots = fileRoots(await provider.getChildren());
      expect(roots.map((r) => (r as { uri: string }).uri)).toEqual([
        "file:///b.ts",
        "file:///c.ts",
        "file:///a.ts",
      ]);
    });

    it("sorts file nodes by max G descending when sort field is g", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///a.ts", g: 1.2, f: 100 }),
          sym({ id: "b", uri: "file:///b.ts", g: 3.5, f: 1 }),
        ])
      );
      provider.setSortField("g");
      const roots = fileRoots(await provider.getChildren());
      expect(roots.map((r) => (r as { uri: string }).uri)).toEqual([
        "file:///b.ts",
        "file:///a.ts",
      ]);
    });

    it("sorts symbols by CC descending when sort field is cc", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///f.ts", cc: 3, f: 100 }),
          sym({ id: "b", uri: "file:///f.ts", cc: 15, f: 1 }),
          sym({ id: "c", uri: "file:///f.ts", cc: 8, f: 50 }),
        ])
      );
      provider.setSortField("cc");
      const children = await provider.getChildren({ type: "file", uri: "file:///f.ts", label: "f.ts" });
      expect(children.map((c) => (c as { type: "symbol"; symbol: SymbolMetrics }).symbol.id)).toEqual([
        "b",
        "c",
        "a",
      ]);
    });

    it("sorts symbols by CRAP descending when sort field is crap", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///f.ts", crap: 2, f: 100 }),
          sym({ id: "b", uri: "file:///f.ts", crap: 30, f: 1 }),
          sym({ id: "c", uri: "file:///f.ts", crap: 10, f: 50 }),
        ])
      );
      provider.setSortField("crap");
      const children = await provider.getChildren({ type: "file", uri: "file:///f.ts", label: "f.ts" });
      expect(children.map((c) => (c as { type: "symbol"; symbol: SymbolMetrics }).symbol.id)).toEqual([
        "b",
        "c",
        "a",
      ]);
    });

    it("defaults to sorting by F descending", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///f.ts", f: 3 }),
          sym({ id: "b", uri: "file:///f.ts", f: 12 }),
          sym({ id: "c", uri: "file:///f.ts", f: 7 }),
        ])
      );
      const children = await provider.getChildren({ type: "file", uri: "file:///f.ts", label: "f.ts" });
      expect(children.map((c) => (c as { type: "symbol"; symbol: SymbolMetrics }).symbol.id)).toEqual([
        "b",
        "c",
        "a",
      ]);
    });

    it("fires onDidChangeTreeData when sort field changes", () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);
      provider.setSortField("cc");
      expect(listener).toHaveBeenCalledOnce();
    });

    it("exposes the current sort field via getter", () => {
      expect(provider.sortField).toBe("f");
      provider.setSortField("crap");
      expect(provider.sortField).toBe("crap");
    });

    it("sorts file nodes by max of current sort field", async () => {
      state.setAnalysis(
        analysis([
          sym({ id: "a", uri: "file:///a.ts", cc: 1, f: 100 }),
          sym({ id: "b", uri: "file:///b.ts", cc: 20, f: 1 }),
        ])
      );
      provider.setSortField("cc");
      const roots = fileRoots(await provider.getChildren());
      expect(roots.map((r) => (r as { uri: string }).uri)).toEqual([
        "file:///b.ts",
        "file:///a.ts",
      ]);
    });
  });
});
