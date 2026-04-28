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
    start: Position;
    end: Position;
    constructor(start: Position, end: Position) {
      this.start = start;
      this.end = end;
    }
    contains(pos: Position) {
      if (pos.line < this.start.line || pos.line > this.end.line) return false;
      if (pos.line === this.start.line && pos.character < this.start.character) return false;
      if (pos.line === this.end.line && pos.character > this.end.character) return false;
      return true;
    }
  }
  class MarkdownString {
    value: string;
    isTrusted = false;
    constructor(value?: string) {
      this.value = value ?? "";
    }
  }
  class Hover {
    contents: MarkdownString[];
    range?: Range;
    constructor(contents: MarkdownString | MarkdownString[], range?: Range) {
      this.contents = Array.isArray(contents) ? contents : [contents];
      this.range = range;
    }
  }
  return {
    Position,
    Range,
    MarkdownString,
    Hover,
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
  formatHoverBreakdown: vi.fn(),
}));

import * as vscode from "vscode";
import { DdpHoverProvider } from "./hoverProvider";
import { getFlatFunctionSymbols } from "../documentSymbols";
import { symbolIdFromUriRange } from "../symbolId";
import { formatHoverBreakdown } from "../../../core/viewModel";
import type { SymbolMetrics } from "../../../core/analyze";
import { sym } from "../../../core/testFixtures";

function fakeState(symbols: SymbolMetrics[] = []) {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  return { symbolById: byId } as any;
}

function fakeDocument(uriStr = "file:///a.ts") {
  return { uri: vscode.Uri.parse(uriStr) } as any;
}

function fakeSymbol(
  name: string,
  startLine: number,
  startChar: number,
  endLine?: number,
  endChar?: number,
) {
  const selStart = new vscode.Position(startLine, startChar);
  const selEnd = new vscode.Position(startLine, startChar + name.length);
  const selectionRange = new vscode.Range(selStart, selEnd);
  const rangeStart = new vscode.Position(startLine, startChar);
  const rangeEnd = new vscode.Position(endLine ?? startLine, endChar ?? startChar + name.length);
  const range = new vscode.Range(rangeStart, rangeEnd);
  return { name, selectionRange, range } as any;
}

const cancelToken = {} as vscode.CancellationToken;

// ═════════════════════════════════════════════════════════════════════
// DdpHoverProvider
// ═════════════════════════════════════════════════════════════════════
describe("DdpHoverProvider", () => {
  beforeEach(() => {
    vi.mocked(getFlatFunctionSymbols).mockReset();
    vi.mocked(symbolIdFromUriRange).mockReset();
    vi.mocked(formatHoverBreakdown).mockReset();
  });

  describe("provideHover", () => {
    // ── High Priority ──────────────────────────────────────────────────

    it("returns undefined when symbolById map is empty", async () => {
      const provider = new DdpHoverProvider(fakeState([]));
      const pos = new vscode.Position(5, 0);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
      expect(getFlatFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns undefined when no function contains position", async () => {
      const provider = new DdpHoverProvider(fakeState([sym({ id: "x" })]));
      const fn = fakeSymbol("myFunc", 10, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      const pos = new vscode.Position(50, 0); // outside fn range

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover with formatted markdown when metrics found", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("**DDP risk** ...");
      const pos = new vscode.Position(5, 2);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("**DDP risk** ...");
      expect(formatHoverBreakdown).toHaveBeenCalledWith(m);
    });

    it("returns undefined when matching function has no metrics in byId", async () => {
      const provider = new DdpHoverProvider(fakeState([sym({ id: "other-id" })]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      const pos = new vscode.Position(5, 2);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover with isTrusted markdown and fn.range", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("content");
      const pos = new vscode.Position(5, 2);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].isTrusted).toBe(true);
      expect(result!.range).toBe(fn.range);
    });

    // ── Medium Priority ────────────────────────────────────────────────

    it("matches position via selectionRange containment", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      // selectionRange: (5,0)-(5,6), range: (5,0)-(5,6)
      const fn = fakeSymbol("myFunc", 5, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");
      // position on the function name itself
      const pos = new vscode.Position(5, 3);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
    });

    it("matches position via range containment when outside selectionRange", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      // selectionRange: (5,0)-(5,6), range: (5,0)-(15,0)
      const fn = fakeSymbol("myFunc", 5, 0, 15, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");
      // position inside body, not on name
      const pos = new vscode.Position(12, 5);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
    });

    it("skips non-matching functions and matches a later one", async () => {
      const m = sym({ id: "file:///a.ts#20:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn1 = fakeSymbol("first", 1, 0, 5, 0);
      const fn2 = fakeSymbol("second", 20, 0, 25, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1, fn2]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#20:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("found second");
      const pos = new vscode.Position(22, 0);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("found second");
    });

    it("returns metrics for nested function when outer function has no metrics", async () => {
      const innerMetrics = sym({ id: "file:///a.ts#10:2" });
      const provider = new DdpHoverProvider(fakeState([innerMetrics]));
      // Outer function range contains inner function
      const outerFn = fakeSymbol("outer", 5, 0, 20, 0);
      const innerFn = fakeSymbol("inner", 10, 2, 15, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([outerFn, innerFn]);
      vi.mocked(symbolIdFromUriRange)
        .mockReturnValueOnce("file:///a.ts#5:0")   // outer — no metrics
        .mockReturnValueOnce("file:///a.ts#10:2");  // inner — has metrics
      vi.mocked(formatHoverBreakdown).mockReturnValue("inner hover");
      const pos = new vscode.Position(12, 5); // inside both outer and inner

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("inner hover");
    });

    // ── Low Priority ───────────────────────────────────────────────────

    it("returns undefined when getFlatFunctionSymbols returns empty array", async () => {
      const provider = new DdpHoverProvider(fakeState([sym({ id: "a" })]));
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([]);
      const pos = new vscode.Position(5, 0);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover only for function with metrics when multiple functions exist", async () => {
      const m = sym({ id: "file:///a.ts#20:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      // Three separate, non-overlapping functions
      const fn1 = fakeSymbol("noMetrics1", 1, 0, 5, 0);
      const fn2 = fakeSymbol("hasMetrics", 20, 0, 25, 0);
      const fn3 = fakeSymbol("noMetrics2", 30, 0, 35, 0);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1, fn2, fn3]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#20:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("matched");
      const pos = new vscode.Position(22, 0);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("matched");
    });

    it("passes formatHoverBreakdown result into MarkdownString", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("**F=2.3** R=1.0 CRAP=2.3 CC=2 T=50%");
      const pos = new vscode.Position(5, 2);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result!.contents[0].value).toBe("**F=2.3** R=1.0 CRAP=2.3 CC=2 T=50%");
      expect(formatHoverBreakdown).toHaveBeenCalledOnce();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═══════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    beforeEach(() => {
      vi.mocked(getFlatFunctionSymbols).mockReset();
      vi.mocked(symbolIdFromUriRange).mockReset();
      vi.mocked(formatHoverBreakdown).mockReset();
    });

    // ── Boundary conditions ────────────────────────────────────────────

    it("returns Hover when position is at exact start of selectionRange", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");
      const pos = new vscode.Position(5, 0); // exact start

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("hover");
    });

    it("returns Hover when position is at exact end of range", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");
      const pos = new vscode.Position(10, 20); // exact end

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
    });

    it("returns undefined when position is one character past range end", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      const pos = new vscode.Position(10, 21); // just past end

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns undefined when position is one line before range start", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      const pos = new vscode.Position(4, 0); // line before fn

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    // ── Stateful operations ────────────────────────────────────────────

    it("returns undefined then Hover after state is populated between calls", async () => {
      const state = fakeState([]);
      const provider = new DdpHoverProvider(state);
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      const pos = new vscode.Position(5, 2);

      // First call: empty state
      const result1 = await provider.provideHover(fakeDocument(), pos, cancelToken);
      expect(result1).toBeUndefined();

      // Populate state
      const m = sym({ id: "file:///a.ts#5:0" });
      state.symbolById = new Map([["file:///a.ts#5:0", m]]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("now populated");

      // Second call: populated state
      const result2 = await provider.provideHover(fakeDocument(), pos, cancelToken);
      expect(result2).toBeDefined();
      expect(result2!.contents[0].value).toBe("now populated");
    });

    it("reuses same provider instance across multiple documents", async () => {
      const m1 = sym({ id: "file:///a.ts#5:0" });
      const m2 = sym({ id: "file:///b.ts#3:0", uri: "file:///b.ts" });
      const provider = new DdpHoverProvider(fakeState([m1, m2]));

      // Document A
      const fnA = fakeSymbol("fnA", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fnA]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("A");
      const resultA = await provider.provideHover(fakeDocument("file:///a.ts"), new vscode.Position(5, 2), cancelToken);
      expect(resultA).toBeDefined();
      expect(resultA!.contents[0].value).toBe("A");

      // Document B
      const fnB = fakeSymbol("fnB", 3, 0, 8, 10);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fnB]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///b.ts#3:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("B");
      const resultB = await provider.provideHover(fakeDocument("file:///b.ts"), new vscode.Position(3, 2), cancelToken);
      expect(resultB).toBeDefined();
      expect(resultB!.contents[0].value).toBe("B");
    });

    // ── Complex interactions ───────────────────────────────────────────

    it("returns Hover for first matching function when multiple functions contain position", async () => {
      // Two non-nested functions that happen to share a line range boundary
      const m1 = sym({ id: "file:///a.ts#5:0" });
      const m2 = sym({ id: "file:///a.ts#5:10" });
      const provider = new DdpHoverProvider(fakeState([m1, m2]));
      const fn1 = fakeSymbol("funcA", 5, 0, 10, 20);
      const fn2 = fakeSymbol("funcB", 5, 10, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn1, fn2]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("first match");
      const pos = new vscode.Position(7, 5);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("first match");
    });

    it("calls symbolIdFromUriRange with document URI and fn.selectionRange", async () => {
      const m = sym({ id: "file:///a.ts#5:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("myFunc", 5, 0, 10, 20);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#5:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");
      const doc = fakeDocument("file:///a.ts");
      const pos = new vscode.Position(5, 2);

      await provider.provideHover(doc, pos, cancelToken);

      expect(symbolIdFromUriRange).toHaveBeenCalledWith(doc.uri, fn.selectionRange);
    });

    it("calls getFlatFunctionSymbols with the document URI", async () => {
      const provider = new DdpHoverProvider(fakeState([sym({ id: "x" })]));
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([]);
      const doc = fakeDocument("file:///special.ts");
      const pos = new vscode.Position(0, 0);

      await provider.provideHover(doc, pos, cancelToken);

      expect(getFlatFunctionSymbols).toHaveBeenCalledWith(doc.uri);
    });

    // ── Single-item/edge collections ───────────────────────────────────

    it("returns Hover when exactly one function symbol exists and matches", async () => {
      const m = sym({ id: "file:///a.ts#0:0" });
      const provider = new DdpHoverProvider(fakeState([m]));
      const fn = fakeSymbol("a", 0, 0, 0, 1);
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue([fn]);
      vi.mocked(symbolIdFromUriRange).mockReturnValue("file:///a.ts#0:0");
      vi.mocked(formatHoverBreakdown).mockReturnValue("single");
      const pos = new vscode.Position(0, 0);

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("single");
    });

    it("returns undefined when many functions exist but none contain position", async () => {
      const provider = new DdpHoverProvider(fakeState([sym({ id: "x" })]));
      const functions = Array.from({ length: 20 }, (_, i) =>
        fakeSymbol(`fn${i}`, i * 10, 0, i * 10 + 5, 0),
      );
      vi.mocked(getFlatFunctionSymbols).mockResolvedValue(functions);
      const pos = new vscode.Position(999, 0); // far beyond any

      const result = await provider.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
    });
  });
});
