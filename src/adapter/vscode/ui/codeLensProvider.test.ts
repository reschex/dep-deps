import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
vi.mock("vscode", () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }
  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }
  class CodeLens {
    constructor(
      public range: Range,
      public command?: any,
    ) {}
  }
  class EventEmitter {
    private _listener: (() => void) | undefined;
    event = (listener: () => void) => {
      this._listener = listener;
      return { dispose: () => { this._listener = undefined; } };
    };
    fire() {
      this._listener?.();
    }
  }
  return {
    EventEmitter,
    CodeLens,
    Position,
    Range,
    Uri: {
      parse(str: string) {
        return { toString: () => str };
      },
    },
  };
});

vi.mock("../../../core/viewModel", () => ({
  formatCodeLensTitle: vi.fn(),
}));

import * as vscode from "vscode";
import { DdpCodeLensProvider } from "./codeLensProvider";
import { formatCodeLensTitle } from "../../../core/viewModel";
import type { DdpConfiguration } from "../configuration";
import type { FunctionSymbolInfo, SymbolProvider } from "../../../core/ports";
import { sym } from "../../../core/testFixtures";

// ── helpers ──────────────────────────────────────────────────────────

function fakeState(symbols: ReturnType<typeof sym>[] = []) {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  return { symbolById: byId } as any;
}

function fakeConfig(overrides: Partial<DdpConfiguration> = {}): DdpConfiguration {
  return {
    coverage: { fallbackT: 0, lcovGlob: "**/coverage/lcov.info" },
    rank: { maxIterations: 100, epsilon: 1e-6 },
    cc: { eslintPath: "eslint", pythonPath: "python", pmdPath: "pmd", useEslintForTsJs: true },
    decoration: { warnThreshold: 50, errorThreshold: 150 },
    fileRollup: "max",
    codelensEnabled: true,
    excludeTests: false,
    ...overrides,
  } as DdpConfiguration;
}

function fakeDocument(uriStr = "file:///a.ts") {
  return { uri: vscode.Uri.parse(uriStr) } as any;
}

const cancelToken = {} as vscode.CancellationToken;

/** Build a FunctionSymbolInfo — the position source that matches NativeSymbolProvider. */
function fnInfo(name: string, startLine: number, startChar: number): FunctionSymbolInfo {
  return {
    name,
    selectionStartLine: startLine,
    selectionStartCharacter: startChar,
    bodyStartLine: startLine,
    bodyEndLine: startLine + 1,
  };
}

/** Build a SymbolProvider stub returning the given infos. */
function makeProvider(infos: FunctionSymbolInfo[]): SymbolProvider {
  return { getFunctionSymbols: vi.fn().mockResolvedValue(infos) } as unknown as SymbolProvider;
}

/** Build a symbol ID consistent with makeSymbolId / NativeSymbolProvider. */
function makeId(uri: string, line: number, char: number): string {
  return `${uri}#${line}:${char}`;
}

// ═════════════════════════════════════════════════════════════════════
// DdpCodeLensProvider
// ═════════════════════════════════════════════════════════════════════
describe("DdpCodeLensProvider", () => {
  beforeEach(() => {
    vi.mocked(formatCodeLensTitle).mockReset();
  });

  // ─── provideCodeLenses: returns empty ──────────────────────────────
  describe("provideCodeLenses", () => {
    it("returns empty array when codelensEnabled is false", async () => {
      const config = fakeConfig({ codelensEnabled: false });
      const provider = makeProvider([]);
      const lens = new DdpCodeLensProvider(fakeState([sym({ id: "a" })]), () => config, provider);

      const result = await lens.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
      expect(provider.getFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns empty array when symbolById map is empty", async () => {
      const provider = makeProvider([]);
      const lens = new DdpCodeLensProvider(fakeState([]), () => fakeConfig(), provider);

      const result = await lens.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
      expect(provider.getFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns empty array when document has no function symbols", async () => {
      const lens = new DdpCodeLensProvider(
        fakeState([sym({ id: "a" })]),
        () => fakeConfig(),
        makeProvider([]),
      );

      const result = await lens.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
    });

    it("skips functions without matching metrics in symbolById", async () => {
      const uri = "file:///a.ts";
      const lens = new DdpCodeLensProvider(
        fakeState([sym({ id: makeId(uri, 5, 0) })]),
        () => fakeConfig(),
        makeProvider([fnInfo("unmatched", 10, 0)]),
      );

      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result).toEqual([]);
    });

    // ─── provideCodeLenses: returns CodeLens ───────────────────────────
    it("returns CodeLens with correct title from formatCodeLensTitle", async () => {
      const uri = "file:///a.ts";
      const id = makeId(uri, 5, 0);
      const m = sym({ id, r: 1.5, crap: 3.0, f: 4.5 });
      vi.mocked(formatCodeLensTitle).mockReturnValue("DDP F=5  R=1.50  CRAP=3.0");

      const lens = new DdpCodeLensProvider(
        fakeState([m]),
        () => fakeConfig(),
        makeProvider([fnInfo("myFunc", 5, 0)]),
      );
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result).toHaveLength(1);
      expect(result[0].command!.title).toBe("DDP F=5  R=1.50  CRAP=3.0");
      expect(formatCodeLensTitle).toHaveBeenCalledWith(m);
    });

    it("returns CodeLens with tooltip containing R, CRAP, CC, and T values", async () => {
      const uri = "file:///a.ts";
      const id = makeId(uri, 5, 0);
      const m = sym({ id, r: 1.234, crap: 5.67, cc: 3, t: 0.85 });

      const lens = new DdpCodeLensProvider(
        fakeState([m]),
        () => fakeConfig(),
        makeProvider([fnInfo("myFunc", 5, 0)]),
      );
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result[0].command!.tooltip).toBe("R=1.234 CRAP=5.67 CC=3 T=85%");
    });

    it("returns CodeLens with command ddp.revealSymbol and symbol ID as argument", async () => {
      const uri = "file:///a.ts";
      const id = makeId(uri, 5, 0);
      const m = sym({ id });

      const lens = new DdpCodeLensProvider(
        fakeState([m]),
        () => fakeConfig(),
        makeProvider([fnInfo("myFunc", 5, 0)]),
      );
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result[0].command!.command).toBe("ddp.revealSymbol");
      expect(result[0].command!.arguments).toEqual([id]);
    });

    it("returns CodeLens with range at the declaration-start position (selectionStartLine:selectionStartCharacter)", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });

      const lens = new DdpCodeLensProvider(
        fakeState([m]),
        () => fakeConfig(),
        makeProvider([fnInfo("myFunc", 5, 0)]),
      );
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result[0].range.start.line).toBe(5);
      expect(result[0].range.start.character).toBe(0);
      expect(result[0].range.end.line).toBe(5);
      expect(result[0].range.end.character).toBe(0);
    });

    // ─── provideCodeLenses: multiple symbols ───────────────────────────
    it("returns multiple CodeLenses for multiple matched functions in order", async () => {
      const uri = "file:///a.ts";
      const m1 = sym({ id: makeId(uri, 1, 0), name: "first" });
      const m2 = sym({ id: makeId(uri, 10, 0), name: "second" });
      vi.mocked(formatCodeLensTitle)
        .mockReturnValueOnce("title-1")
        .mockReturnValueOnce("title-2");

      const lens = new DdpCodeLensProvider(
        fakeState([m1, m2]),
        () => fakeConfig(),
        makeProvider([fnInfo("first", 1, 0), fnInfo("second", 10, 0)]),
      );
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result).toHaveLength(2);
      expect(result[0].command!.title).toBe("title-1");
      expect(result[1].command!.title).toBe("title-2");
    });

    it("returns CodeLenses only for functions with matching metrics", async () => {
      const uri = "file:///a.ts";
      const m1 = sym({ id: makeId(uri, 1, 0) });
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const lens = new DdpCodeLensProvider(
        fakeState([m1]),
        () => fakeConfig(),
        makeProvider([fnInfo("matched", 1, 0), fnInfo("unmatched", 5, 0)]),
      );
      const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

      expect(result).toHaveLength(1);
      expect(result[0].command!.arguments).toEqual([makeId(uri, 1, 0)]);
    });
  });

  // ─── invalidate ────────────────────────────────────────────────────
  describe("invalidate", () => {
    it("fires onDidChangeCodeLenses event when called", () => {
      const lens = new DdpCodeLensProvider(fakeState(), () => fakeConfig(), makeProvider([]));
      const listener = vi.fn();
      lens.onDidChangeCodeLenses(listener);

      lens.invalidate();

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ─── state updates ─────────────────────────────────────────────────
  describe("state updates between calls", () => {
    it("returns updated results when state changes between provideCodeLenses calls", async () => {
      const uri = "file:///a.ts";
      const m1 = sym({ id: makeId(uri, 1, 0) });
      const state = fakeState([m1]);
      vi.mocked(formatCodeLensTitle).mockReturnValue("title-1");

      const lens = new DdpCodeLensProvider(state, () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));

      // First call: one match
      const result1 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
      expect(result1).toHaveLength(1);

      // Update state: clear all symbols
      state.symbolById = new Map();
      const result2 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
      expect(result2).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═════════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    // ─── complex interactions ──────────────────────────────────────────
    describe("complex interactions", () => {
      it("returns empty then lenses when config toggles from disabled to enabled", async () => {
        const uri = "file:///a.ts";
        let enabled = false;
        const m = sym({ id: makeId(uri, 1, 0) });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig({ codelensEnabled: enabled }),
          makeProvider([fnInfo("fn", 1, 0)]),
        );

        const r1 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        expect(r1).toEqual([]);

        enabled = true;
        const r2 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        expect(r2).toHaveLength(1);
      });

      it("returns lenses then empty when config toggles from enabled to disabled", async () => {
        const uri = "file:///a.ts";
        let enabled = true;
        const m = sym({ id: makeId(uri, 1, 0) });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig({ codelensEnabled: enabled }),
          makeProvider([fnInfo("fn", 1, 0)]),
        );

        const r1 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        expect(r1).toHaveLength(1);

        enabled = false;
        const r2 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        expect(r2).toEqual([]);
      });

      it("calls symbolProvider.getFunctionSymbols with the document URI string", async () => {
        const uri = "file:///specific/path.ts";
        const m = sym({ id: makeId(uri, 1, 0) });
        const provider = makeProvider([]);

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), provider);
        const doc = fakeDocument(uri);

        await lens.provideCodeLenses(doc, cancelToken);

        expect(provider.getFunctionSymbols).toHaveBeenCalledWith(uri);
      });

      it("builds ID from selectionStartLine:selectionStartCharacter (matches makeSymbolId)", async () => {
        const uri = "file:///doc.ts";
        // Symbol at declaration-start (line 3, char 7) — not the name position
        const id = makeId(uri, 3, 7);
        const m = sym({ id });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig(),
          makeProvider([fnInfo("fn", 3, 7)]),
        );
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        // ID was built correctly, so the lens was found and produced
        expect(result).toHaveLength(1);
        expect(result[0].command!.arguments).toEqual([id]);
      });

      it("returns correct lenses when called with different documents sequentially", async () => {
        const uri1 = "file:///doc1.ts";
        const uri2 = "file:///doc2.ts";
        const m1 = sym({ id: makeId(uri1, 1, 0) });
        const m2 = sym({ id: makeId(uri2, 5, 0) });
        const provider = makeProvider([]);

        const lens = new DdpCodeLensProvider(fakeState([m1, m2]), () => fakeConfig(), provider);

        // First document
        vi.mocked(provider.getFunctionSymbols).mockResolvedValueOnce([fnInfo("fn1", 1, 0)]);
        vi.mocked(formatCodeLensTitle).mockReturnValueOnce("title-doc1");
        const r1 = await lens.provideCodeLenses(fakeDocument(uri1), cancelToken);
        expect(r1).toHaveLength(1);
        expect(r1[0].command!.title).toBe("title-doc1");

        // Second document
        vi.mocked(provider.getFunctionSymbols).mockResolvedValueOnce([fnInfo("fn2", 5, 0)]);
        vi.mocked(formatCodeLensTitle).mockReturnValueOnce("title-doc2");
        const r2 = await lens.provideCodeLenses(fakeDocument(uri2), cancelToken);
        expect(r2).toHaveLength(1);
        expect(r2[0].command!.title).toBe("title-doc2");
      });
    });

    // ─── stateful operations ───────────────────────────────────────────
    describe("stateful operations", () => {
      it("fires event multiple times when invalidate called repeatedly", () => {
        const lens = new DdpCodeLensProvider(fakeState(), () => fakeConfig(), makeProvider([]));
        const listener = vi.fn();
        lens.onDidChangeCodeLenses(listener);

        lens.invalidate();
        lens.invalidate();
        lens.invalidate();

        expect(listener).toHaveBeenCalledTimes(3);
      });

      it("returns consistent results across multiple provideCodeLenses calls", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 2.5, crap: 4.0, cc: 3, t: 0.75 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig(),
          makeProvider([fnInfo("fn", 1, 0)]),
        );

        const r1 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        const r2 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(r1[0].command!.tooltip).toBe(r2[0].command!.tooltip);
        expect(r1[0].command!.command).toBe(r2[0].command!.command);
      });

      it("returns independent arrays from each provideCodeLenses call", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0) });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig(),
          makeProvider([fnInfo("fn", 1, 0)]),
        );

        const r1 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);
        const r2 = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(r1).not.toBe(r2);
      });
    });

    // ─── numeric edge cases in tooltip ─────────────────────────────────
    describe("tooltip formatting", () => {
      it("formats tooltip with zero values as R=0.000 CRAP=0.00 CC=0 T=0%", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 0, crap: 0, cc: 0, t: 0 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=0 T=0%");
      });

      it("formats tooltip with extreme values correctly", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 9999.999, crap: 12345.67, cc: 999, t: 1 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=9999.999 CRAP=12345.67 CC=999 T=100%");
      });

      it("formats tooltip with very small fractional values correctly", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 0.0001, crap: 0.001, cc: 1, t: 0.001 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=1 T=0%");
      });
    });

    // ─── error handling ────────────────────────────────────────────────
    describe("error handling", () => {
      it("propagates error when symbolProvider.getFunctionSymbols rejects", async () => {
        const failingProvider: SymbolProvider = {
          getFunctionSymbols: vi.fn().mockRejectedValue(new Error("symbol fetch failed")),
        } as unknown as SymbolProvider;

        const lens = new DdpCodeLensProvider(
          fakeState([sym({ id: "a" })]),
          () => fakeConfig(),
          failingProvider,
        );

        await expect(lens.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("symbol fetch failed");
      });

      it("propagates error when formatCodeLensTitle throws", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0) });
        vi.mocked(formatCodeLensTitle).mockImplementation(() => { throw new Error("format error"); });

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig(),
          makeProvider([fnInfo("fn", 1, 0)]),
        );

        await expect(lens.provideCodeLenses(fakeDocument(uri), cancelToken))
          .rejects.toThrow("format error");
      });

      it("returns empty when getConfig throws", async () => {
        const lens = new DdpCodeLensProvider(fakeState([sym({ id: "a" })]), () => {
          throw new Error("config error");
        }, makeProvider([]));

        await expect(lens.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("config error");
      });
    });

    // ─── violated domain constraints ───────────────────────────────────
    describe("violated domain constraints", () => {
      it("returns one CodeLens per function even when multiple map to the same symbol ID", async () => {
        const uri = "file:///a.ts";
        const id = makeId(uri, 1, 0);
        const m = sym({ id });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(
          fakeState([m]),
          () => fakeConfig(),
          makeProvider([fnInfo("fn1", 1, 0), fnInfo("fn2", 1, 0)]),
        );
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        // Both functions resolve to the same id — both get a lens
        expect(result).toHaveLength(2);
        expect(result[0].command!.arguments).toEqual([id]);
        expect(result[1].command!.arguments).toEqual([id]);
      });

      it("uses last symbol when state has duplicate IDs in input", async () => {
        const uri = "file:///a.ts";
        const id = makeId(uri, 1, 0);
        const m1 = sym({ id, r: 1.0, crap: 1.0 });
        const m2 = sym({ id, r: 9.0, crap: 9.0 });
        // Map deduplicates by key — last one wins
        const byId = new Map([[id, m1], [id, m2]]);
        const state = { symbolById: byId } as any;
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(state, () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toContain("R=9.000");
      });
    });

    // ─── collection edge cases ─────────────────────────────────────────
    describe("collection edge cases", () => {
      it("returns CodeLenses for many functions (100+)", async () => {
        const uri = "file:///a.ts";
        const symbols = Array.from({ length: 100 }, (_, i) =>
          sym({ id: makeId(uri, i, 0), name: `fn${i}` }),
        );
        const infos = Array.from({ length: 100 }, (_, i) => fnInfo(`fn${i}`, i, 0));
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState(symbols), () => fakeConfig(), makeProvider(infos));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result).toHaveLength(100);
      });

      it("returns empty array when symbolProvider resolves to empty after state has symbols", async () => {
        const lens = new DdpCodeLensProvider(
          fakeState([sym({ id: "a" }), sym({ id: "b" })]),
          () => fakeConfig(),
          makeProvider([]),
        );

        const result = await lens.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result).toEqual([]);
      });
    });

    // ─── numeric edge cases in tooltip (extended) ──────────────────────
    describe("numeric edge cases in tooltip", () => {
      it("formats tooltip with NaN values as R=NaN CRAP=NaN", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: NaN, crap: NaN, cc: 0, t: NaN });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=NaN CRAP=NaN CC=0 T=NaN%");
      });

      it("formats tooltip with Infinity values", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: Infinity, crap: Infinity, cc: 0, t: 0 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=Infinity CRAP=Infinity CC=0 T=0%");
      });

      it("formats tooltip with negative r and crap values", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: -1.5, crap: -2.345, cc: -1, t: -0.5 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=-1.500 CRAP=-2.35 CC=-1 T=-50%");
      });

      it("formats tooltip with -0 as R=0.000", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: -0, crap: -0, cc: 0, t: -0 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=0 T=0%");
      });

      it("formats tooltip with t > 1 showing coverage above 100%", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 1, crap: 1, cc: 1, t: 1.5 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=1.000 CRAP=1.00 CC=1 T=150%");
      });

      it("formats tooltip with r having many decimal places (rounds to 3)", async () => {
        const uri = "file:///a.ts";
        const m = sym({ id: makeId(uri, 1, 0), r: 1.23456789, crap: 9.87654321, cc: 5, t: 0.123456 });
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), makeProvider([fnInfo("fn", 1, 0)]));
        const result = await lens.provideCodeLenses(fakeDocument(uri), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=1.235 CRAP=9.88 CC=5 T=12%");
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Regression: ID source must match NativeSymbolProvider (commit 89e0e69)
  // ═════════════════════════════════════════════════════════════════════
  describe("regression: SymbolProvider replaces getFlatFunctionSymbols (commit 89e0e69)", () => {
    it("accepts a SymbolProvider as the third constructor parameter and uses it for ID lookup", async () => {
      // Bug: after commit 89e0e69 replaced VsCodeSymbolProvider (LSP name-position)
      // with NativeSymbolProvider (declaration-start position), the code lens provider
      // still used getFlatFunctionSymbols → selectionRange (name position), causing
      // byId.get(id) to always miss. Fix: accept SymbolProvider and build IDs from
      // selectionStartLine:selectionStartCharacter to match makeSymbolId in analysisOrchestrator.
      const fakeProvider = {
        getFunctionSymbols: vi.fn().mockResolvedValue([
          { name: "add", selectionStartLine: 1, selectionStartCharacter: 0, bodyStartLine: 1, bodyEndLine: 3 },
        ]),
      };
      const m = sym({ id: "file:///a.ts#1:0" });
      // Third constructor parameter: SymbolProvider (new dependency)
      const lens = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig(), fakeProvider as any);
      vi.mocked(formatCodeLensTitle).mockReturnValue("DDP F=2");

      const result = await lens.provideCodeLenses(fakeDocument("file:///a.ts"), cancelToken);

      // ID built as `${uri}#${selectionStartLine}:${selectionStartCharacter}` = "file:///a.ts#1:0"
      // which matches m.id — so a lens is produced. Before fix: 0 lenses.
      expect(result).toHaveLength(1);
    });
  });
});
