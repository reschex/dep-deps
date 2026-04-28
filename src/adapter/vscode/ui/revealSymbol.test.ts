import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
const mockOpenTextDocument = vi.fn();
const mockShowTextDocument = vi.fn();

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
  return {
    Position,
    Range,
    workspace: {
      openTextDocument: (...args: any[]) => mockOpenTextDocument(...args),
    },
    window: {
      showTextDocument: (...args: any[]) => mockShowTextDocument(...args),
    },
  };
});

// ── symbolId mock ────────────────────────────────────────────────────
vi.mock("../symbolId", () => ({
  parseUriFromSymbolId: vi.fn(),
}));

import { parseUriFromSymbolId } from "../symbolId";
import { revealSymbolById } from "./revealSymbol";

// ── helpers ──────────────────────────────────────────────────────────
function fakeUri(str: string) {
  return { toString: () => str, scheme: "file" };
}

function fakeDoc() {
  return { uri: fakeUri("file:///a.ts") };
}

// ═════════════════════════════════════════════════════════════════════
describe("revealSymbolById", () => {
  beforeEach(() => {
    vi.mocked(parseUriFromSymbolId).mockReset();
    mockOpenTextDocument.mockReset();
    mockShowTextDocument.mockReset();
  });

  // ─── Early returns ─────────────────────────────────────────────────
  describe("early returns — no document opened", () => {
    it("returns without opening document when id has no hash", async () => {
      await revealSymbolById("file:///a.ts");

      expect(mockOpenTextDocument).not.toHaveBeenCalled();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it("returns without opening document when hash is at position 0", async () => {
      await revealSymbolById("#10:5");

      expect(mockOpenTextDocument).not.toHaveBeenCalled();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it("returns without opening document for empty string", async () => {
      await revealSymbolById("");

      expect(mockOpenTextDocument).not.toHaveBeenCalled();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it("returns without opening document when parseUriFromSymbolId returns undefined", async () => {
      vi.mocked(parseUriFromSymbolId).mockReturnValue(undefined);

      await revealSymbolById("bad\x00uri#1:2");

      expect(parseUriFromSymbolId).toHaveBeenCalledWith("bad\x00uri#1:2");
      expect(mockOpenTextDocument).not.toHaveBeenCalled();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path — valid selection ──────────────────────────────────
  describe("valid id with line and character", () => {
    it("opens document and shows it with selection for valid id", async () => {
      const uri = fakeUri("file:///a.ts");
      const doc = fakeDoc();
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(doc);

      await revealSymbolById("file:///a.ts#10:5");

      expect(mockOpenTextDocument).toHaveBeenCalledWith(uri);
      expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {
        selection: expect.objectContaining({
          start: expect.objectContaining({ line: 10, character: 5 }),
          end: expect.objectContaining({ line: 10, character: 5 }),
        }),
      });
    });

    it("creates a zero-width range (start equals end) for the selection", async () => {
      const uri = fakeUri("file:///a.ts");
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(fakeDoc());

      await revealSymbolById("file:///a.ts#3:7");

      const opts = mockShowTextDocument.mock.calls[0][1];
      expect(opts.selection.start.line).toEqual(3);
      expect(opts.selection.start.character).toEqual(7);
      expect(opts.selection.end.line).toEqual(3);
      expect(opts.selection.end.character).toEqual(7);
    });

    it("opens document and shows selection at line 0 character 0", async () => {
      const uri = fakeUri("file:///a.ts");
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(fakeDoc());

      await revealSymbolById("file:///a.ts#0:0");

      const opts = mockShowTextDocument.mock.calls[0][1];
      expect(opts.selection.start.line).toEqual(0);
      expect(opts.selection.start.character).toEqual(0);
    });
  });

  // ─── No selection — NaN line or character ──────────────────────────
  describe("shows document without selection when position is unparseable", () => {
    it("passes empty options when line is non-numeric", async () => {
      const uri = fakeUri("file:///a.ts");
      const doc = fakeDoc();
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(doc);

      await revealSymbolById("file:///a.ts#abc:5");

      expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
    });

    it("passes empty options when character is non-numeric", async () => {
      const uri = fakeUri("file:///a.ts");
      const doc = fakeDoc();
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(doc);

      await revealSymbolById("file:///a.ts#10:abc");

      expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
    });

    it("passes empty options when nothing follows hash", async () => {
      const uri = fakeUri("file:///a.ts");
      const doc = fakeDoc();
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(doc);

      await revealSymbolById("file:///a.ts#");

      expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
    });

    it("passes empty options when no colon after hash (line only)", async () => {
      const uri = fakeUri("file:///a.ts");
      const doc = fakeDoc();
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(doc);

      await revealSymbolById("file:///a.ts#10");

      // parts = ["10"], parts[1] is undefined → parseInt("", 10) → NaN
      expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("creates selection with negative line value (parseInt parses -1)", async () => {
      const uri = fakeUri("file:///a.ts");
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(fakeDoc());

      await revealSymbolById("file:///a.ts#-1:5");

      const opts = mockShowTextDocument.mock.calls[0][1];
      expect(opts.selection).toBeDefined();
      expect(opts.selection.start.line).toEqual(-1);
      expect(opts.selection.start.character).toEqual(5);
    });

    it("creates selection for very large line and character values", async () => {
      const uri = fakeUri("file:///a.ts");
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(fakeDoc());

      await revealSymbolById("file:///a.ts#99999:99999");

      const opts = mockShowTextDocument.mock.calls[0][1];
      expect(opts.selection.start.line).toEqual(99999);
      expect(opts.selection.start.character).toEqual(99999);
    });

    it("creates selection when id contains multiple hashes (parseInt stops at #)", async () => {
      const uri = fakeUri("file:///a.ts");
      vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
      mockOpenTextDocument.mockResolvedValue(fakeDoc());

      // rest = "10:5#extra", parts = ["10", "5#extra"]
      // parseInt("5#extra", 10) → 5 (stops at non-digit #)
      await revealSymbolById("file:///a.ts#10:5#extra");

      const opts = mockShowTextDocument.mock.calls[0][1];
      expect(opts.selection.start.line).toEqual(10);
      expect(opts.selection.start.character).toEqual(5);
    });

    it("passes the correct id to parseUriFromSymbolId", async () => {
      vi.mocked(parseUriFromSymbolId).mockReturnValue(undefined);

      await revealSymbolById("file:///my%20project/file.ts#5:2");

      expect(parseUriFromSymbolId).toHaveBeenCalledWith("file:///my%20project/file.ts#5:2");
    });
  });

  // ─── bugmagnet session 2026-04-16 ─────────────────────────────────
  describe("bugmagnet session 2026-04-16", () => {
    // ── Call order ───────────────────────────────────────────────────
    describe("call order", () => {
      it("calls openTextDocument before showTextDocument", async () => {
        const uri = fakeUri("file:///a.ts");
        const doc = fakeDoc();
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        const callOrder: string[] = [];
        mockOpenTextDocument.mockImplementation(async () => {
          callOrder.push("open");
          return doc;
        });
        mockShowTextDocument.mockImplementation(async () => {
          callOrder.push("show");
        });

        await revealSymbolById("file:///a.ts#1:0");

        expect(callOrder).toEqual(["open", "show"]);
      });

      it("passes the document returned by openTextDocument to showTextDocument", async () => {
        const uri = fakeUri("file:///a.ts");
        const specificDoc = { uri, special: "marker" };
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(specificDoc);

        await revealSymbolById("file:///a.ts#1:0");

        expect(mockShowTextDocument.mock.calls[0][0]).toBe(specificDoc);
      });
    });

    // ── Error propagation ────────────────────────────────────────────
    describe("error propagation", () => {
      it("propagates rejection when openTextDocument fails", async () => {
        const uri = fakeUri("file:///missing.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockRejectedValue(new Error("file not found"));

        await expect(revealSymbolById("file:///missing.ts#1:0"))
          .rejects.toThrow("file not found");
      });

      it("propagates rejection when showTextDocument fails", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());
        mockShowTextDocument.mockRejectedValue(new Error("editor unavailable"));

        await expect(revealSymbolById("file:///a.ts#1:0"))
          .rejects.toThrow("editor unavailable");
      });

      it("does not call showTextDocument when openTextDocument rejects", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockRejectedValue(new Error("boom"));

        await revealSymbolById("file:///a.ts#1:0").catch(() => {});

        expect(mockShowTextDocument).not.toHaveBeenCalled();
      });
    });

    // ── String edge cases in id ──────────────────────────────────────
    describe("string edge cases", () => {
      it("returns early for id that is only a hash character", async () => {
        // indexOf("#") returns 0, which is <= 0
        await revealSymbolById("#");

        expect(mockOpenTextDocument).not.toHaveBeenCalled();
      });

      it("returns early for id with hash at position 0 followed by content", async () => {
        await revealSymbolById("#some:content");

        expect(mockOpenTextDocument).not.toHaveBeenCalled();
      });

      it("creates selection for id with URI containing encoded characters", async () => {
        const uri = fakeUri("file:///c%3A/my%20project/%C3%BCber.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById("file:///c%3A/my%20project/%C3%BCber.ts#42:8");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(42);
        expect(opts.selection.start.character).toEqual(8);
      });

      it("creates selection for id with very long URI prefix", async () => {
        const longPath = "a".repeat(500);
        const idStr = `file:///${longPath}/file.ts#7:3`;
        const uri = fakeUri(`file:///${longPath}/file.ts`);
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById(idStr);

        expect(mockOpenTextDocument).toHaveBeenCalledWith(uri);
        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(7);
        expect(opts.selection.start.character).toEqual(3);
      });

      it("parses correctly when colon appears in URI scheme before hash", async () => {
        // The colon in "file:" should not interfere with the "line:char" split
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById("file:///a.ts#20:15");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(20);
        expect(opts.selection.start.character).toEqual(15);
      });

      it("passes empty options when rest after hash is only a colon", async () => {
        const uri = fakeUri("file:///a.ts");
        const doc = fakeDoc();
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(doc);

        // rest = ":", parts = ["", ""], parseInt("",10) → NaN for both
        await revealSymbolById("file:///a.ts#:");

        expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
      });

      it("passes empty options when rest after hash contains multiple colons with no digits", async () => {
        const uri = fakeUri("file:///a.ts");
        const doc = fakeDoc();
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(doc);

        // rest = ":::", parts = ["", "", "", ""]
        await revealSymbolById("file:///a.ts#:::");

        expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
      });
    });

    // ── Numeric edge cases for line:char ─────────────────────────────
    describe("numeric edge cases", () => {
      it("creates selection when line and char have leading zeros", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        // parseInt("007", 10) → 7, parseInt("003", 10) → 3
        await revealSymbolById("file:///a.ts#007:003");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(7);
        expect(opts.selection.start.character).toEqual(3);
      });

      it("creates selection when line and char include trailing non-digits (parseInt tolerance)", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        // parseInt("10px", 10) → 10, parseInt("5em", 10) → 5
        await revealSymbolById("file:///a.ts#10px:5em");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(10);
        expect(opts.selection.start.character).toEqual(5);
      });

      it("passes empty options when line is a float with dot as first non-digit", async () => {
        const uri = fakeUri("file:///a.ts");
        const doc = fakeDoc();
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(doc);

        // parseInt("10.5", 10) → 10 (stops at dot), parseInt("3.2", 10) → 3
        // Both are valid numbers so selection IS created
        await revealSymbolById("file:///a.ts#10.5:3.2");

        const opts = mockShowTextDocument.mock.calls[0][1];
        // parseInt truncates at the dot — still creates selection with integer part
        expect(opts.selection.start.line).toEqual(10);
        expect(opts.selection.start.character).toEqual(3);
      });

      it("passes empty options when line starts with a space", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        // parseInt(" 10", 10) → 10 (leading spaces are trimmed by parseInt)
        await revealSymbolById("file:///a.ts# 10: 5");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(10);
        expect(opts.selection.start.character).toEqual(5);
      });

      it("passes empty options when line is +0 and char is -0", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById("file:///a.ts#+0:-0");

        // parseInt("+0", 10) → 0, parseInt("-0", 10) → -0, !isNaN(-0) → true
        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection).toBeDefined();
        expect(opts.selection.start.line).toEqual(0);
        // parseInt("-0", 10) produces -0; our mock Position stores it as-is
        expect(Object.is(opts.selection.start.character, -0)).toBe(true);
      });

      it("creates selection when both parts are MAX_SAFE_INTEGER-scale numbers", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById("file:///a.ts#9007199254740991:9007199254740991");

        const opts = mockShowTextDocument.mock.calls[0][1];
        expect(opts.selection.start.line).toEqual(Number.MAX_SAFE_INTEGER);
        expect(opts.selection.start.character).toEqual(Number.MAX_SAFE_INTEGER);
      });
    });

    // ── Complex interactions ─────────────────────────────────────────
    describe("complex interactions", () => {
      it("calls parseUriFromSymbolId exactly once per invocation", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(fakeDoc());

        await revealSymbolById("file:///a.ts#1:0");

        expect(parseUriFromSymbolId).toHaveBeenCalledTimes(1);
      });

      it("does not call parseUriFromSymbolId when hash guard returns early", async () => {
        await revealSymbolById("no-hash-here");

        expect(parseUriFromSymbolId).not.toHaveBeenCalled();
      });

      it("still opens document and shows without selection when only line parses but not char", async () => {
        const uri = fakeUri("file:///a.ts");
        const doc = fakeDoc();
        vi.mocked(parseUriFromSymbolId).mockReturnValue(uri as any);
        mockOpenTextDocument.mockResolvedValue(doc);

        // parts[0] = "5", parts[1] = "" → parseInt("", 10) = NaN
        await revealSymbolById("file:///a.ts#5:");

        expect(mockOpenTextDocument).toHaveBeenCalledWith(uri);
        expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
      });
    });
  });
});
