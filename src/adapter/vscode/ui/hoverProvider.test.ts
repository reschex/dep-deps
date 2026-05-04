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

vi.mock("../../../core/viewModel", () => ({
  formatHoverBreakdown: vi.fn(),
}));

import * as vscode from "vscode";
import { DdpHoverProvider } from "./hoverProvider";
import { formatHoverBreakdown } from "../../../core/viewModel";
import type { FunctionSymbolInfo, SymbolProvider } from "../../../core/ports";
import { sym } from "../../../core/testFixtures";

// ── helpers ──────────────────────────────────────────────────────────

function fakeState(symbols: ReturnType<typeof sym>[] = []) {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  return { symbolById: byId } as any;
}

function fakeDocument(uriStr = "file:///a.ts") {
  return { uri: vscode.Uri.parse(uriStr) } as any;
}

const cancelToken = {} as vscode.CancellationToken;

/** Build a FunctionSymbolInfo — the position source that matches NativeSymbolProvider. */
function fnInfo(
  name: string,
  startLine: number,
  startChar: number,
  endLine?: number,
): FunctionSymbolInfo {
  return {
    name,
    selectionStartLine: startLine,
    selectionStartCharacter: startChar,
    bodyStartLine: startLine,
    bodyEndLine: endLine ?? startLine,
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
// DdpHoverProvider
// ═════════════════════════════════════════════════════════════════════
describe("DdpHoverProvider", () => {
  beforeEach(() => {
    vi.mocked(formatHoverBreakdown).mockReset();
  });

  describe("provideHover", () => {
    // ── High Priority ──────────────────────────────────────────────────

    it("returns undefined when symbolById map is empty", async () => {
      const provider = makeProvider([]);
      const hover = new DdpHoverProvider(fakeState([]), provider);
      const pos = new vscode.Position(5, 0);

      const result = await hover.provideHover(fakeDocument(), pos, cancelToken);

      expect(result).toBeUndefined();
      expect(provider.getFunctionSymbols).not.toHaveBeenCalled();
    });

    it("returns undefined when no function contains position", async () => {
      const uri = "file:///a.ts";
      const hover = new DdpHoverProvider(
        fakeState([sym({ id: makeId(uri, 10, 0) })]),
        makeProvider([fnInfo("myFunc", 10, 0, 14)]),
      );
      const pos = new vscode.Position(50, 0); // outside fn range (lines 10–14)

      const result = await hover.provideHover(fakeDocument(uri), pos, cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover with formatted markdown when metrics found", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("**DDP risk** ...");

      const hover = new DdpHoverProvider(
        fakeState([m]),
        makeProvider([fnInfo("myFunc", 5, 0, 10)]),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 2), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("**DDP risk** ...");
      expect(formatHoverBreakdown).toHaveBeenCalledWith(m);
    });

    it("returns undefined when matching function has no metrics in byId", async () => {
      const uri = "file:///a.ts";
      const hover = new DdpHoverProvider(
        fakeState([sym({ id: makeId(uri, 99, 0) })]), // different ID
        makeProvider([fnInfo("myFunc", 5, 0, 10)]),
      );

      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 2), cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover with isTrusted markdown and range anchored at declaration-start", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("content");

      const hover = new DdpHoverProvider(
        fakeState([m]),
        makeProvider([fnInfo("myFunc", 5, 0, 10)]),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 2), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].isTrusted).toBe(true);
      // Range is anchored at declaration-start (selectionStartLine:selectionStartChar)
      expect(result!.range!.start.line).toBe(5);
      expect(result!.range!.start.character).toBe(0);
      expect(result!.range!.end.line).toBe(10);
    });

    // ── Medium Priority ────────────────────────────────────────────────

    it("matches position on the function declaration line", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 3), cancelToken);

      expect(result).toBeDefined();
    });

    it("matches position inside the function body (past declaration line)", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 15)]));
      // position inside body at line 12, not on declaration line 5
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(12, 5), cancelToken);

      expect(result).toBeDefined();
    });

    it("skips non-matching functions and matches a later one", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 20, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("found second");

      const hover = new DdpHoverProvider(
        fakeState([m]),
        makeProvider([fnInfo("first", 1, 0, 5), fnInfo("second", 20, 0, 25)]),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(22, 0), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("found second");
    });

    it("returns metrics for nested function when outer function has no metrics", async () => {
      const uri = "file:///a.ts";
      const innerMetrics = sym({ id: makeId(uri, 10, 2) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("inner hover");

      const hover = new DdpHoverProvider(
        fakeState([innerMetrics]),
        makeProvider([fnInfo("outer", 5, 0, 20), fnInfo("inner", 10, 2, 15)]),
      );
      // position inside both outer and inner
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(12, 5), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("inner hover");
    });

    // ── Low Priority ───────────────────────────────────────────────────

    it("returns undefined when symbolProvider resolves to empty array", async () => {
      const uri = "file:///a.ts";
      const hover = new DdpHoverProvider(
        fakeState([sym({ id: makeId(uri, 1, 0) })]),
        makeProvider([]),
      );

      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 0), cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns Hover only for function with metrics when multiple functions exist", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 20, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("matched");

      const hover = new DdpHoverProvider(
        fakeState([m]),
        makeProvider([
          fnInfo("noMetrics1", 1, 0, 5),
          fnInfo("hasMetrics", 20, 0, 25),
          fnInfo("noMetrics2", 30, 0, 35),
        ]),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(22, 0), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("matched");
    });

    it("passes formatHoverBreakdown result into MarkdownString", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("**F=2.3** R=1.0 CRAP=2.3 CC=2 T=50%");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 2), cancelToken);

      expect(result!.contents[0].value).toBe("**F=2.3** R=1.0 CRAP=2.3 CC=2 T=50%");
      expect(formatHoverBreakdown).toHaveBeenCalledOnce();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═══════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    beforeEach(() => {
      vi.mocked(formatHoverBreakdown).mockReset();
    });

    // ── Boundary conditions ────────────────────────────────────────────

    it("returns Hover when position is on the first line of the function", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(5, 0), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("hover");
    });

    it("returns Hover when position is on the last line of the function body", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(10, 0), cancelToken);

      expect(result).toBeDefined();
    });

    it("returns undefined when position is on the line after bodyEndLine", async () => {
      // FunctionSymbolInfo carries bodyEndLine but not bodyEndCharacter, so containment
      // is line-based: position on line > bodyEndLine is outside.
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(11, 0), cancelToken);

      expect(result).toBeUndefined();
    });

    it("returns undefined when position is on the line before the function", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 5, 0) });

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(4, 0), cancelToken);

      expect(result).toBeUndefined();
    });

    // ── Stateful operations ────────────────────────────────────────────

    it("returns undefined then Hover after state is populated between calls", async () => {
      const uri = "file:///a.ts";
      const state = fakeState([]);
      vi.mocked(formatHoverBreakdown).mockReturnValue("now populated");

      const hover = new DdpHoverProvider(state, makeProvider([fnInfo("myFunc", 5, 0, 10)]));
      const pos = new vscode.Position(5, 2);

      // First call: empty state
      const result1 = await hover.provideHover(fakeDocument(uri), pos, cancelToken);
      expect(result1).toBeUndefined();

      // Populate state
      const m = sym({ id: makeId(uri, 5, 0) });
      state.symbolById = new Map([[makeId(uri, 5, 0), m]]);

      // Second call: populated state
      const result2 = await hover.provideHover(fakeDocument(uri), pos, cancelToken);
      expect(result2).toBeDefined();
      expect(result2!.contents[0].value).toBe("now populated");
    });

    it("reuses same provider instance across multiple documents", async () => {
      const m1 = sym({ id: makeId("file:///a.ts", 5, 0) });
      const m2 = sym({ id: makeId("file:///b.ts", 3, 0), uri: "file:///b.ts" });
      const provider = makeProvider([]); // overridden per call via mockResolvedValueOnce

      const hover = new DdpHoverProvider(fakeState([m1, m2]), provider);

      // Document A
      vi.mocked(provider.getFunctionSymbols).mockResolvedValueOnce([fnInfo("fnA", 5, 0, 10)]);
      vi.mocked(formatHoverBreakdown).mockReturnValueOnce("A");
      const resultA = await hover.provideHover(fakeDocument("file:///a.ts"), new vscode.Position(5, 2), cancelToken);
      expect(resultA).toBeDefined();
      expect(resultA!.contents[0].value).toBe("A");

      // Document B
      vi.mocked(provider.getFunctionSymbols).mockResolvedValueOnce([fnInfo("fnB", 3, 0, 8)]);
      vi.mocked(formatHoverBreakdown).mockReturnValueOnce("B");
      const resultB = await hover.provideHover(fakeDocument("file:///b.ts"), new vscode.Position(3, 2), cancelToken);
      expect(resultB).toBeDefined();
      expect(resultB!.contents[0].value).toBe("B");
    });

    // ── Complex interactions ───────────────────────────────────────────

    it("returns Hover for first matching function when multiple functions contain position", async () => {
      const uri = "file:///a.ts";
      const m1 = sym({ id: makeId(uri, 5, 0) });
      const m2 = sym({ id: makeId(uri, 5, 10) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("first match");

      const hover = new DdpHoverProvider(
        fakeState([m1, m2]),
        makeProvider([fnInfo("funcA", 5, 0, 10), fnInfo("funcB", 5, 10, 10)]),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(7, 5), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("first match");
    });

    it("calls symbolProvider.getFunctionSymbols with the document URI string", async () => {
      const uri = "file:///special.ts";
      const provider = makeProvider([]);

      const hover = new DdpHoverProvider(fakeState([sym({ id: makeId(uri, 1, 0) })]), provider);
      await hover.provideHover(fakeDocument(uri), new vscode.Position(0, 0), cancelToken);

      expect(provider.getFunctionSymbols).toHaveBeenCalledWith(uri);
    });

    it("builds ID from selectionStartLine:selectionStartCharacter (matches makeSymbolId)", async () => {
      const uri = "file:///doc.ts";
      const id = makeId(uri, 3, 7);
      const m = sym({ id });
      vi.mocked(formatHoverBreakdown).mockReturnValue("found");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("fn", 3, 7, 6)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(4, 0), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("found");
    });

    // ── Single-item/edge collections ───────────────────────────────────

    it("returns Hover when exactly one function symbol exists and matches", async () => {
      const uri = "file:///a.ts";
      const m = sym({ id: makeId(uri, 0, 0) });
      vi.mocked(formatHoverBreakdown).mockReturnValue("single");

      const hover = new DdpHoverProvider(fakeState([m]), makeProvider([fnInfo("a", 0, 0, 0)]));
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(0, 0), cancelToken);

      expect(result).toBeDefined();
      expect(result!.contents[0].value).toBe("single");
    });

    it("returns undefined when many functions exist but none contain position", async () => {
      const uri = "file:///a.ts";
      const hover = new DdpHoverProvider(
        fakeState([sym({ id: makeId(uri, 0, 0) })]),
        makeProvider(Array.from({ length: 20 }, (_, i) => fnInfo(`fn${i}`, i * 10, 0, i * 10 + 5))),
      );
      const result = await hover.provideHover(fakeDocument(uri), new vscode.Position(999, 0), cancelToken);

      expect(result).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Regression: ID source must match NativeSymbolProvider (commit 89e0e69)
  // ═════════════════════════════════════════════════════════════════════
  describe("DdpHoverProvider — SymbolProvider integration (regression)", () => {
    beforeEach(() => {
      vi.mocked(formatHoverBreakdown).mockReset();
    });

    it("accepts a SymbolProvider and returns hover when declaration-start ID matches state", async () => {
      // Bug: DdpHoverProvider used getFlatFunctionSymbols → symbolIdFromUriRange
      // (LSP name-position) for lookup, but state uses NativeSymbolProvider IDs
      // (node.getStart() declaration-start). Fix: inject SymbolProvider, build ID from
      // selectionStartLine:selectionStartCharacter matching makeSymbolId.
      const fakeProvider = {
        getFunctionSymbols: vi.fn().mockResolvedValue([
          { name: "add", selectionStartLine: 1, selectionStartCharacter: 0, bodyStartLine: 1, bodyEndLine: 3 },
        ]),
      };
      const m = sym({ id: "file:///a.ts#1:0" });
      // Second constructor parameter: SymbolProvider (new dependency)
      const hover = new DdpHoverProvider(fakeState([m]), fakeProvider as any);
      vi.mocked(formatHoverBreakdown).mockReturnValue("hover content");
      const pos = new vscode.Position(1, 5); // inside function (line 1-3)

      const result = await hover.provideHover(fakeDocument("file:///a.ts"), pos, cancelToken);

      // ID built as "file:///a.ts#1:0" matches m.id — hover returned. Before fix: undefined.
      expect(result).toBeDefined();
    });
  });
});
