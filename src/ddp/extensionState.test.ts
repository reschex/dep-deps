import { describe, it, expect } from "vitest";
import type { SymbolMetrics } from "../core/analyze";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";
import { ExtensionState } from "./extensionState";
import { sym } from "../core/testFixtures";

function analysis(symbols: SymbolMetrics[]): AnalysisResult {
  return { symbols, fileRollup: new Map(), edgesCount: 0 };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("ExtensionState", () => {
  // ─── Initial state ─────────────────────────────────────────────────
  describe("initial state", () => {
    it("returns undefined for lastAnalysis before any setAnalysis call", () => {
      const state = new ExtensionState();
      expect(state.lastAnalysis).toBeUndefined();
    });

    it("returns empty map for symbolById before any setAnalysis call", () => {
      const state = new ExtensionState();
      expect(state.symbolById.size).toEqual(0);
    });

    it("returns 0 for analysisGeneration before any setAnalysis call", () => {
      const state = new ExtensionState();
      expect(state.analysisGeneration).toEqual(0);
    });
  });

  // ─── setAnalysis with valid result ─────────────────────────────────
  describe("setAnalysis with valid result", () => {
    it("stores the analysis result in lastAnalysis", () => {
      const state = new ExtensionState();
      const s = sym({ id: "a" });
      const result = analysis([s]);

      state.setAnalysis(result);

      expect(state.lastAnalysis).toBe(result);
    });

    it("increments analysisGeneration by 1", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "a" })]));

      expect(state.analysisGeneration).toEqual(1);
    });

    it("builds symbolById map from result symbols", () => {
      const state = new ExtensionState();
      const s1 = sym({ id: "x", name: "funcX" });
      const s2 = sym({ id: "y", name: "funcY" });

      state.setAnalysis(analysis([s1, s2]));

      expect(state.symbolById.size).toEqual(2);
      expect(state.symbolById.get("x")).toBe(s1);
      expect(state.symbolById.get("y")).toBe(s2);
    });
  });

  // ─── setAnalysis with undefined ────────────────────────────────────
  describe("setAnalysis with undefined", () => {
    it("sets lastAnalysis to undefined", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "a" })]));

      state.setAnalysis(undefined);

      expect(state.lastAnalysis).toBeUndefined();
    });

    it("increments analysisGeneration even when clearing", () => {
      const state = new ExtensionState();
      state.setAnalysis(undefined);

      expect(state.analysisGeneration).toEqual(1);
    });

    it("clears symbolById map when result is undefined", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "a" })]));
      expect(state.symbolById.size).toEqual(1);

      state.setAnalysis(undefined);

      expect(state.symbolById.size).toEqual(0);
    });
  });

  // ─── Sequential / stateful behavior ────────────────────────────────
  describe("sequential calls", () => {
    it("increments generation on each setAnalysis call", () => {
      const state = new ExtensionState();

      state.setAnalysis(analysis([sym({ id: "a" })]));
      state.setAnalysis(analysis([sym({ id: "b" })]));
      state.setAnalysis(undefined);

      expect(state.analysisGeneration).toEqual(3);
    });

    it("replaces lastAnalysis with the most recent result", () => {
      const state = new ExtensionState();
      const first = analysis([sym({ id: "a" })]);
      const second = analysis([sym({ id: "b" })]);

      state.setAnalysis(first);
      state.setAnalysis(second);

      expect(state.lastAnalysis).toBe(second);
    });

    it("replaces symbolById map discarding old symbols", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "old" })]));
      expect(state.symbolById.has("old")).toBe(true);

      state.setAnalysis(analysis([sym({ id: "new" })]));

      expect(state.symbolById.has("old")).toBe(false);
      expect(state.symbolById.has("new")).toBe(true);
    });

    it("continues incrementing generation after clearing and re-setting", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "a" })]));
      state.setAnalysis(undefined);
      state.setAnalysis(analysis([sym({ id: "b" })]));

      expect(state.analysisGeneration).toEqual(3);
      expect(state.lastAnalysis).toBeDefined();
      expect(state.symbolById.has("b")).toBe(true);
    });
  });

  // ─── Edge cases in symbol data ─────────────────────────────────────
  describe("edge cases in symbol data", () => {
    it("stores result with empty symbols array and leaves symbolById empty", () => {
      const state = new ExtensionState();
      const result = analysis([]);

      state.setAnalysis(result);

      expect(state.lastAnalysis).toBe(result);
      expect(state.symbolById.size).toEqual(0);
      expect(state.analysisGeneration).toEqual(1);
    });

    it("stores result with single symbol accessible by ID", () => {
      const state = new ExtensionState();
      const s = sym({ id: "only", name: "onlyFn" });

      state.setAnalysis(analysis([s]));

      expect(state.symbolById.size).toEqual(1);
      expect(state.symbolById.get("only")).toBe(s);
    });

    it("keeps last symbol when duplicate IDs exist in symbols array", () => {
      const state = new ExtensionState();
      const first = sym({ id: "dup", name: "first" });
      const second = sym({ id: "dup", name: "second" });

      state.setAnalysis(analysis([first, second]));

      expect(state.symbolById.size).toEqual(1);
      expect(state.symbolById.get("dup")!.name).toEqual("second");
    });
  });

  // ─── Collection edge cases ─────────────────────────────────────────
  describe("collection edge cases", () => {
    it("handles result with many symbols (100+) all accessible by ID", () => {
      const state = new ExtensionState();
      const symbols = Array.from({ length: 150 }, (_, i) =>
        sym({ id: `sym-${i}`, name: `fn${i}` })
      );

      state.setAnalysis(analysis(symbols));

      expect(state.symbolById.size).toEqual(150);
      expect(state.symbolById.get("sym-0")!.name).toEqual("fn0");
      expect(state.symbolById.get("sym-149")!.name).toEqual("fn149");
    });

    it("returns a map that does not have a set method at the type level", () => {
      const state = new ExtensionState();
      state.setAnalysis(analysis([sym({ id: "a" })]));

      const map = state.symbolById;

      // ReadonlyMap exposes get/has/size but not set/delete
      expect(map.get("a")).toBeDefined();
      expect(map.has("a")).toBe(true);
      expect(typeof map.size).toEqual("number");
      // At runtime it's still a Map, but the type hides mutation methods
      expect(typeof (map as unknown as Map<string, unknown>).set).toEqual("function");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-15
  // ═══════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-15", () => {
    // ─── Stateful operations ───────────────────────────────────────
    describe("stateful operations", () => {
      it("returns consistent state when setAnalysis is called many times in sequence", () => {
        const state = new ExtensionState();
        for (let i = 0; i < 50; i++) {
          state.setAnalysis(analysis([sym({ id: `s${i}` })]));
        }

        expect(state.analysisGeneration).toEqual(50);
        expect(state.symbolById.size).toEqual(1);
        expect(state.symbolById.has("s49")).toBe(true);
        expect(state.symbolById.has("s0")).toBe(false);
      });

      it("returns correct state after alternating set and clear cycles", () => {
        const state = new ExtensionState();

        state.setAnalysis(analysis([sym({ id: "a" })]));
        state.setAnalysis(undefined);
        state.setAnalysis(analysis([sym({ id: "b" })]));
        state.setAnalysis(undefined);
        state.setAnalysis(analysis([sym({ id: "c" })]));

        expect(state.analysisGeneration).toEqual(5);
        expect(state.lastAnalysis).toBeDefined();
        expect(state.symbolById.size).toEqual(1);
        expect(state.symbolById.get("c")).toBeDefined();
      });

      it("returns correct state when setting undefined multiple times consecutively", () => {
        const state = new ExtensionState();
        state.setAnalysis(analysis([sym({ id: "a" })]));

        state.setAnalysis(undefined);
        state.setAnalysis(undefined);
        state.setAnalysis(undefined);

        expect(state.analysisGeneration).toEqual(4);
        expect(state.lastAnalysis).toBeUndefined();
        expect(state.symbolById.size).toEqual(0);
      });

      it("returns correct state when setting same result object multiple times", () => {
        const state = new ExtensionState();
        const result = analysis([sym({ id: "a" })]);

        state.setAnalysis(result);
        state.setAnalysis(result);
        state.setAnalysis(result);

        expect(state.analysisGeneration).toEqual(3);
        expect(state.lastAnalysis).toBe(result);
        expect(state.symbolById.size).toEqual(1);
      });
    });

    // ─── String edge cases in symbol IDs ───────────────────────────
    describe("string edge cases in symbol IDs", () => {
      it("retrieves symbol with empty-string ID", () => {
        const state = new ExtensionState();
        const s = sym({ id: "" });

        state.setAnalysis(analysis([s]));

        expect(state.symbolById.size).toEqual(1);
        expect(state.symbolById.get("")).toBe(s);
      });

      it("retrieves symbol with whitespace-only ID", () => {
        const state = new ExtensionState();
        const s = sym({ id: "  \t\n" });

        state.setAnalysis(analysis([s]));

        expect(state.symbolById.get("  \t\n")).toBe(s);
      });

      it("retrieves symbol with very long ID", () => {
        const state = new ExtensionState();
        const longId = "x".repeat(10000);
        const s = sym({ id: longId });

        state.setAnalysis(analysis([s]));

        expect(state.symbolById.get(longId)).toBe(s);
      });

      it("distinguishes symbols with IDs differing only by case", () => {
        const state = new ExtensionState();
        const lower = sym({ id: "abc", name: "lower" });
        const upper = sym({ id: "ABC", name: "upper" });

        state.setAnalysis(analysis([lower, upper]));

        expect(state.symbolById.size).toEqual(2);
        expect(state.symbolById.get("abc")!.name).toEqual("lower");
        expect(state.symbolById.get("ABC")!.name).toEqual("upper");
      });

      it("retrieves symbol with special characters in ID", () => {
        const state = new ExtensionState();
        const id = "file:///path/to/file.ts#L10-L20::myFunc<T>";
        const s = sym({ id });

        state.setAnalysis(analysis([s]));

        expect(state.symbolById.get(id)).toBe(s);
      });

      it("retrieves symbol with unicode characters in ID", () => {
        const state = new ExtensionState();
        const s = sym({ id: "日本語関数" });

        state.setAnalysis(analysis([s]));

        expect(state.symbolById.get("日本語関数")).toBe(s);
      });
    });

    // ─── Violated domain constraints ───────────────────────────────
    describe("violated domain constraints", () => {
      it("stores result whose symbols have extreme metric values", () => {
        const state = new ExtensionState();
        const s = sym({
          id: "extreme",
          cc: Number.MAX_SAFE_INTEGER,
          t: 0,
          r: Infinity,
          crap: Infinity,
          f: Infinity,
        });

        state.setAnalysis(analysis([s]));

        const retrieved = state.symbolById.get("extreme")!;
        expect(retrieved.cc).toEqual(Number.MAX_SAFE_INTEGER);
        expect(retrieved.r).toEqual(Infinity);
        expect(retrieved.f).toEqual(Infinity);
      });

      it("stores result whose symbols have NaN metric values", () => {
        const state = new ExtensionState();
        const s = sym({ id: "nan-metrics", cc: Number.NaN, crap: Number.NaN, f: Number.NaN });

        state.setAnalysis(analysis([s]));

        const retrieved = state.symbolById.get("nan-metrics")!;
        expect(retrieved.cc).toBeNaN();
        expect(retrieved.crap).toBeNaN();
        expect(retrieved.f).toBeNaN();
      });

      it("stores result whose symbols have negative metric values", () => {
        const state = new ExtensionState();
        const s = sym({ id: "neg", cc: -5, t: -1, r: -10, crap: -100, f: -50 });

        state.setAnalysis(analysis([s]));

        const retrieved = state.symbolById.get("neg")!;
        expect(retrieved.cc).toEqual(-5);
        expect(retrieved.t).toEqual(-1);
        expect(retrieved.f).toEqual(-50);
      });

      it("stores result whose symbols have zero for all metrics", () => {
        const state = new ExtensionState();
        const s = sym({ id: "zero", cc: 0, t: 0, r: 0, crap: 0, f: 0 });

        state.setAnalysis(analysis([s]));

        const retrieved = state.symbolById.get("zero")!;
        expect(retrieved.cc).toEqual(0);
        expect(retrieved.t).toEqual(0);
        expect(retrieved.f).toEqual(0);
      });
    });

    // ─── Complex interactions ──────────────────────────────────────
    describe("complex interactions", () => {
      it("returns symbolById map independent of lastAnalysis reference", () => {
        const state = new ExtensionState();
        const s = sym({ id: "a", name: "fn" });
        state.setAnalysis(analysis([s]));

        const mapBefore = state.symbolById;
        // Setting new analysis creates a new map instance
        state.setAnalysis(analysis([sym({ id: "b" })]));

        // Old map reference is stale — new map has different content
        expect(mapBefore.has("a")).toBe(true);
        expect(state.symbolById.has("a")).toBe(false);
        expect(state.symbolById.has("b")).toBe(true);
      });

      it("returns lastAnalysis symbols consistent with symbolById entries", () => {
        const state = new ExtensionState();
        const s1 = sym({ id: "x", name: "funcX" });
        const s2 = sym({ id: "y", name: "funcY" });

        state.setAnalysis(analysis([s1, s2]));

        // Every symbol in lastAnalysis should be in symbolById
        for (const s of state.lastAnalysis!.symbols) {
          expect(state.symbolById.get(s.id)).toBe(s);
        }
        // symbolById size matches symbols array length (no duplicates)
        expect(state.symbolById.size).toEqual(state.lastAnalysis!.symbols.length);
      });

      it("preserves fileRollup and edgesCount in lastAnalysis", () => {
        const state = new ExtensionState();
        const rollup = new Map([["file.ts", 42.5]]);
        const result: AnalysisResult = {
          symbols: [sym({ id: "a" })],
          fileRollup: rollup,
          edgesCount: 7,
        };

        state.setAnalysis(result);

        expect(state.lastAnalysis!.fileRollup).toBe(rollup);
        expect(state.lastAnalysis!.edgesCount).toEqual(7);
      });

      it("handles result with symbols from multiple files", () => {
        const state = new ExtensionState();
        const s1 = sym({ id: "a", uri: "file:///one.ts" });
        const s2 = sym({ id: "b", uri: "file:///two.ts" });
        const s3 = sym({ id: "c", uri: "file:///three.ts" });

        state.setAnalysis(analysis([s1, s2, s3]));

        expect(state.symbolById.size).toEqual(3);
        expect(state.symbolById.get("a")!.uri).toEqual("file:///one.ts");
        expect(state.symbolById.get("b")!.uri).toEqual("file:///two.ts");
        expect(state.symbolById.get("c")!.uri).toEqual("file:///three.ts");
      });

      it("returns stale lastAnalysis reference when underlying data is mutated externally", () => {
        const state = new ExtensionState();
        const symbols = [sym({ id: "a" })];
        const result = analysis(symbols);

        state.setAnalysis(result);

        // Externally mutate the symbols array
        symbols.push(sym({ id: "b" }));

        // lastAnalysis.symbols reflects the mutation (same reference)
        expect(state.lastAnalysis!.symbols.length).toEqual(2);
        // But symbolById was built at setAnalysis time — it only has "a"
        expect(state.symbolById.size).toEqual(1);
        expect(state.symbolById.has("a")).toBe(true);
        expect(state.symbolById.has("b")).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Scope tracking for refresh
  // ═══════════════════════════════════════════════════════════════════
  describe("lastScope tracking", () => {
    it("returns undefined for lastScope before any analysis", () => {
      const state = new ExtensionState();
      expect(state.lastScope).toBeUndefined();
    });

    it("stores the scope passed to setAnalysis", () => {
      const state = new ExtensionState();
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };

      state.setAnalysis(analysis([sym({ id: "a" })]), scope);

      expect(state.lastScope).toEqual(scope);
    });

    it("sets lastScope to undefined for workspace-wide analysis", () => {
      const state = new ExtensionState();
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };
      state.setAnalysis(analysis([sym({ id: "a" })]), scope);

      state.setAnalysis(analysis([sym({ id: "b" })]));

      expect(state.lastScope).toBeUndefined();
    });
  });
});
