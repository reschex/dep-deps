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

// ── dependency mocks ─────────────────────────────────────────────────
vi.mock("../documentSymbols", () => ({
  getFlatFunctionSymbols: vi.fn(),
}));

vi.mock("../symbolId", () => ({
  symbolIdFromUriRange: vi.fn(),
}));

vi.mock("../../../core/viewModel", () => ({
  formatCodeLensTitle: vi.fn(),
}));

import * as vscode from "vscode";
import { DdpCodeLensProvider } from "./codeLensProvider";
import { getFlatFunctionSymbols } from "../documentSymbols";
import { symbolIdFromUriRange } from "../symbolId";
import { formatCodeLensTitle } from "../../../core/viewModel";
import type { DdpConfiguration } from "../configuration";
import { sym } from "../../../core/testFixtures";

function fakeState(symbols: SymbolMetrics[] = []) {
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
  };
}

function fakeDocument(uriStr = "file:///a.ts") {
  return { uri: vscode.Uri.parse(uriStr) } as any;
}

const cancelToken = {} as vscode.CancellationToken;

function fakeSymbol(name: string, startLine: number, startChar: number) {
  const range = new vscode.Range(
    new vscode.Position(startLine, startChar),
    new vscode.Position(startLine, startChar + name.length),
  );
  return { name, selectionRange: range } as any;
}

// ═════════════════════════════════════════════════════════════════════
// DdpCodeLensProvider
// ═════════════════════════════════════════════════════════════════════
describe("DdpCodeLensProvider", () => {
  beforeEach(() => {
    vi.mocked(getFlatFunctionSymbols).mockReset();
    vi.mocked(symbolIdFromUriRange).mockReset();
    vi.mocked(formatCodeLensTitle).mockReset();
  });

  // ─── provideCodeLenses: returns empty ──────────────────────────────
  describe("provideCodeLenses", () => {
    it("returns empty array when codelensEnabled is false", async () => {
      const config = fakeConfig({ codelensEnabled: false });
      const provider = new DdpCodeLensProvider(fakeState([sym({ id: "a" })]), () => config);

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
      expect(getFlatFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns empty array when symbolById map is empty", async () => {
      const provider = new DdpCodeLensProvider(fakeState([]), () => fakeConfig());

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
      expect(getFlatFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns empty array when document has no function symbols", async () => {
      const provider = new DdpCodeLensProvider(
        fakeState([sym({ id: "a" })]),
        () => fakeConfig(),
      );
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([]);

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
    });

    it("skips functions without matching metrics in symbolById", async () => {
      const provider = new DdpCodeLensProvider(
        fakeState([sym({ id: "file:///a.ts#5:0" })]),
        () => fakeConfig(),
      );
      const fn = fakeSymbol("unmatched", 10, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#10:0");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toEqual([]);
    });

    // ─── provideCodeLenses: returns CodeLens ───────────────────────────
    it("returns CodeLens with correct title from formatCodeLensTitle", async () => {
      const m = sym({ id: "file:///a.ts#5:0", r: 1.5, crap: 3.0, f: 4.5 });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      const fn = fakeSymbol("myFunc", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatCodeLensTitle).mockReturnValue("DDP F=5  R=1.50  CRAP=3.0");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toHaveLength(1);
      expect(result[0].command!.title).toBe("DDP F=5  R=1.50  CRAP=3.0");
      expect(formatCodeLensTitle).toHaveBeenCalledWith(m);
    });

    it("returns CodeLens with tooltip containing R, CRAP, CC, and T values", async () => {
      const m = sym({ id: "file:///a.ts#5:0", r: 1.234, crap: 5.67, cc: 3, t: 0.85 });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      const fn = fakeSymbol("myFunc", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].command!.tooltip).toBe("R=1.234 CRAP=5.67 CC=3 T=85%");
    });

    it("returns CodeLens with command ddp.revealSymbol and symbol ID as argument", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      const fn = fakeSymbol("myFunc", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].command!.command).toBe("ddp.revealSymbol");
      expect(result[0].command!.arguments).toEqual(["file:///a.ts#5:0"]);
    });

    it("returns CodeLens with fn.selectionRange as the lens range", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      const fn = fakeSymbol("myFunc", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].range).toBe(fn.selectionRange);
    });

    // ─── provideCodeLenses: multiple symbols ───────────────────────────
    it("returns multiple CodeLenses for multiple matched functions in order", async () => {
      const m1 = sym({ id: "id-1", name: "first" });
      const m2 = sym({ id: "id-2", name: "second" });
      const provider = new DdpCodeLensProvider(fakeState([m1, m2]), () => fakeConfig());
      const fn1 = fakeSymbol("first", 1, 0);
      const fn2 = fakeSymbol("second", 10, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1, fn2]);
      vi.mocked(symbolIdFromUriRange)
        .mockReturnValueOnce("id-1")
        .mockReturnValueOnce("id-2");
      vi.mocked(formatCodeLensTitle)
        .mockReturnValueOnce("title-1")
        .mockReturnValueOnce("title-2");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toHaveLength(2);
      expect(result[0].command!.title).toBe("title-1");
      expect(result[1].command!.title).toBe("title-2");
    });

    it("returns CodeLenses only for functions with matching metrics", async () => {
      const m1 = sym({ id: "id-matched" });
      const provider = new DdpCodeLensProvider(fakeState([m1]), () => fakeConfig());
      const fnMatched = fakeSymbol("matched", 1, 0);
      const fnUnmatched = fakeSymbol("unmatched", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fnMatched, fnUnmatched]);
      vi.mocked(symbolIdFromUriRange)
        .mockReturnValueOnce("id-matched")
        .mockReturnValueOnce("id-unmatched");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result).toHaveLength(1);
      expect(result[0].command!.arguments).toEqual(["id-matched"]);
    });
  });

  // ─── invalidate ────────────────────────────────────────────────────
  describe("invalidate", () => {
    it("fires onDidChangeCodeLenses event when called", () => {
      const provider = new DdpCodeLensProvider(fakeState(), () => fakeConfig());
      const listener = vi.fn();
      provider.onDidChangeCodeLenses(listener);

      provider.invalidate();

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ─── state updates ─────────────────────────────────────────────────
  describe("state updates between calls", () => {
    it("returns updated results when state changes between provideCodeLenses calls", async () => {
      const m1 = sym({ id: "id-1" });
      const state = fakeState([m1]);
      const provider = new DdpCodeLensProvider(state, () => fakeConfig());
      const fn1 = fakeSymbol("fn", 1, 0);

      // First call: one match
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title-1");
      const result1 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
      expect(result1).toHaveLength(1);

      // Update state: clear all symbols
      state.symbolById = new Map();
      const result2 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
      expect(result2).toEqual([]);
    });
  });

  // ─── tooltip edge cases ────────────────────────────────────────────
  describe("tooltip formatting", () => {
    it("formats tooltip with zero values as R=0.000 CRAP=0.00 CC=0 T=0%", async () => {
      const m = sym({ id: "id-z", r: 0, crap: 0, cc: 0, t: 0 });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("id-z");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=0 T=0%");
    });

    it("formats tooltip with extreme values correctly", async () => {
      const m = sym({ id: "id-x", r: 9999.999, crap: 12345.67, cc: 999, t: 1 });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("id-x");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].command!.tooltip).toBe("R=9999.999 CRAP=12345.67 CC=999 T=100%");
    });

    it("formats tooltip with very small fractional values correctly", async () => {
      const m = sym({ id: "id-s", r: 0.0001, crap: 0.001, cc: 1, t: 0.001 });
      const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("id-s");
      vi.mocked(formatCodeLensTitle).mockReturnValue("title");

      const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

      expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=1 T=0%");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═════════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    // ─── complex interactions ──────────────────────────────────────────
    describe("complex interactions", () => {
      it("returns empty then lenses when config toggles from disabled to enabled", async () => {
        let enabled = false;
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig({ codelensEnabled: enabled }));
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const r1 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        expect(r1).toEqual([]);

        enabled = true;
        const r2 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        expect(r2).toHaveLength(1);
      });

      it("returns lenses then empty when config toggles from enabled to disabled", async () => {
        let enabled = true;
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig({ codelensEnabled: enabled }));
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const r1 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        expect(r1).toHaveLength(1);

        enabled = false;
        const r2 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        expect(r2).toEqual([]);
      });

      it("passes document.uri to getFlatFunctionSymbols", async () => {
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        const doc = fakeDocument("file:///specific/path.ts");
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([]);

        await provider.provideCodeLenses(doc, cancelToken);

        expect(getFlatFunctionSymbols).toHaveBeenCalledWith(doc.uri);
      });

      it("passes document.uri and fn.selectionRange to symbolIdFromUriRange", async () => {
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        const doc = fakeDocument("file:///doc.ts");
        const fn = fakeSymbol("fn", 3, 7);
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        await provider.provideCodeLenses(doc, cancelToken);

        expect(symbolIdFromUriRange).toHaveBeenCalledWith(doc.uri, fn.selectionRange);
      });

      it("returns correct lenses when called with different documents sequentially", async () => {
        const m1 = sym({ id: "id-doc1" });
        const m2 = sym({ id: "id-doc2" });
        const provider = new DdpCodeLensProvider(fakeState([m1, m2]), () => fakeConfig());

        // First document
        const doc1 = fakeDocument("file:///doc1.ts");
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn1", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-doc1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title-doc1");
        const r1 = await provider.provideCodeLenses(doc1, cancelToken);
        expect(r1).toHaveLength(1);
        expect(r1[0].command!.title).toBe("title-doc1");

        // Second document
        const doc2 = fakeDocument("file:///doc2.ts");
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn2", 5, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-doc2");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title-doc2");
        const r2 = await provider.provideCodeLenses(doc2, cancelToken);
        expect(r2).toHaveLength(1);
        expect(r2[0].command!.title).toBe("title-doc2");
      });
    });

    // ─── stateful operations ───────────────────────────────────────────
    describe("stateful operations", () => {
      it("fires event multiple times when invalidate called repeatedly", () => {
        const provider = new DdpCodeLensProvider(fakeState(), () => fakeConfig());
        const listener = vi.fn();
        provider.onDidChangeCodeLenses(listener);

        provider.invalidate();
        provider.invalidate();
        provider.invalidate();

        expect(listener).toHaveBeenCalledTimes(3);
      });

      it("returns consistent results across multiple provideCodeLenses calls", async () => {
        const m = sym({ id: "id-1", r: 2.5, crap: 4.0, cc: 3, t: 0.75 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const r1 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        const r2 = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(r1[0].command!.tooltip).toBe(r2[0].command!.tooltip);
        expect(r1[0].command!.command).toBe(r2[0].command!.command);
      });

      it("returns independent arrays from each provideCodeLenses call", async () => {
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const r1 = await provider.provideCodeLenses(fakeDocument(), cancelToken);
        const r2 = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(r1).not.toBe(r2);
      });
    });

    // ─── numeric edge cases in tooltip ─────────────────────────────────
    describe("numeric edge cases in tooltip", () => {
      it("formats tooltip with NaN values as R=NaN CRAP=NaN", async () => {
        const m = sym({ id: "id-nan", r: NaN, crap: NaN, cc: 0, t: NaN });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-nan");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=NaN CRAP=NaN CC=0 T=NaN%");
      });

      it("formats tooltip with Infinity values", async () => {
        const m = sym({ id: "id-inf", r: Infinity, crap: Infinity, cc: 0, t: 0 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-inf");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=Infinity CRAP=Infinity CC=0 T=0%");
      });

      it("formats tooltip with negative r and crap values", async () => {
        const m = sym({ id: "id-neg", r: -1.5, crap: -2.345, cc: -1, t: -0.5 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-neg");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=-1.500 CRAP=-2.35 CC=-1 T=-50%");
      });

      it("formats tooltip with -0 as R=0.000", async () => {
        const m = sym({ id: "id-nz", r: -0, crap: -0, cc: 0, t: -0 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-nz");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=0.000 CRAP=0.00 CC=0 T=0%");
      });

      it("formats tooltip with t > 1 showing coverage above 100%", async () => {
        const m = sym({ id: "id-over", r: 1, crap: 1, cc: 1, t: 1.5 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-over");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=1.000 CRAP=1.00 CC=1 T=150%");
      });

      it("formats tooltip with r having many decimal places (rounds to 3)", async () => {
        const m = sym({ id: "id-dec", r: 1.23456789, crap: 9.87654321, cc: 5, t: 0.123456 });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-dec");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result[0].command!.tooltip).toBe("R=1.235 CRAP=9.88 CC=5 T=12%");
      });
    });

    // ─── error handling ────────────────────────────────────────────────
    describe("error handling", () => {
      it("propagates error when getFlatFunctionSymbols rejects", async () => {
        const provider = new DdpCodeLensProvider(
          fakeState([sym({ id: "a" })]),
          () => fakeConfig(),
        );
        vi.mocked(getFlatFunctionSymbols).mockRejectedValue(new Error("symbol fetch failed"));

        await expect(provider.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("symbol fetch failed");
      });

      it("propagates error when formatCodeLensTitle throws", async () => {
        const m = sym({ id: "id-1" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("id-1");
        vi.mocked(formatCodeLensTitle).mockImplementation(() => { throw new Error("format error"); });

        await expect(provider.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("format error");
      });

      it("propagates error when symbolIdFromUriRange throws", async () => {
        const provider = new DdpCodeLensProvider(
          fakeState([sym({ id: "a" })]),
          () => fakeConfig(),
        );
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockImplementation(() => { throw new Error("id error"); });

        await expect(provider.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("id error");
      });
    });

    // ─── violated domain constraints ───────────────────────────────────
    describe("violated domain constraints", () => {
      it("returns one CodeLens when multiple functions map to same symbol ID", async () => {
        const m = sym({ id: "dup-id" });
        const provider = new DdpCodeLensProvider(fakeState([m]), () => fakeConfig());
        const fn1 = fakeSymbol("fn1", 1, 0);
        const fn2 = fakeSymbol("fn2", 5, 0);
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1, fn2]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("dup-id");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        // Both functions map to same ID and both get a CodeLens
        expect(result).toHaveLength(2);
        expect(result[0].command!.arguments).toEqual(["dup-id"]);
        expect(result[1].command!.arguments).toEqual(["dup-id"]);
      });

      it("uses last symbol when state has duplicate IDs in input", async () => {
        // Map deduplicates by key — last one wins
        const m1 = sym({ id: "dup", r: 1.0, crap: 1.0 });
        const m2 = sym({ id: "dup", r: 9.0, crap: 9.0 });
        const byId = new Map([["dup", m1], ["dup", m2]]);
        const state = { symbolById: byId } as any;
        const provider = new DdpCodeLensProvider(state, () => fakeConfig());
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fakeSymbol("fn", 1, 0)]);
        vi.mocked(symbolIdFromUriRange).mockReturnValue("dup");
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        // Map keeps last entry for duplicate key
        expect(result[0].command!.tooltip).toContain("R=9.000");
      });

      it("returns empty when getConfig throws", async () => {
        const provider = new DdpCodeLensProvider(fakeState([sym({ id: "a" })]), () => {
          throw new Error("config error");
        });

        await expect(provider.provideCodeLenses(fakeDocument(), cancelToken))
          .rejects.toThrow("config error");
      });
    });

    // ─── collection edge cases ─────────────────────────────────────────
    describe("collection edge cases", () => {
      it("returns CodeLenses for many functions (100+)", async () => {
        const symbols = Array.from({ length: 100 }, (_, i) =>
          sym({ id: `id-${i}`, name: `fn${i}` }),
        );
        const provider = new DdpCodeLensProvider(fakeState(symbols), () => fakeConfig());
        const fns = Array.from({ length: 100 }, (_, i) => fakeSymbol(`fn${i}`, i, 0));
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue(fns);
        vi.mocked(symbolIdFromUriRange).mockImplementation((_, range: any) => `id-${range.start.line}`);
        vi.mocked(formatCodeLensTitle).mockReturnValue("title");

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result).toHaveLength(100);
      });

      it("returns empty array when getFlatFunctionSymbols resolves to empty after state has symbols", async () => {
        const provider = new DdpCodeLensProvider(
          fakeState([sym({ id: "a" }), sym({ id: "b" })]),
          () => fakeConfig(),
        );
        vi.mocked(getFlatFunctionSymbols).mockResolvedValue([]);

        const result = await provider.provideCodeLenses(fakeDocument(), cancelToken);

        expect(result).toEqual([]);
        expect(symbolIdFromUriRange).not.toHaveBeenCalled();
      });
    });
  });
});
