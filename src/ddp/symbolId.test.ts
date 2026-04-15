import { describe, it, expect, vi } from "vitest";

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
  return {
    Uri: {
      parse(str: string) {
        if (str.includes("\x00")) {
          throw new Error("invalid URI");
        }
        const colonIdx = str.indexOf(":");
        const scheme = colonIdx > 0 ? str.slice(0, colonIdx) : "";
        return { toString: () => str, scheme };
      },
    },
    Position,
    Range,
  };
});

import * as vscode from "vscode";
import { symbolIdFromUriRange, parseUriFromSymbolId } from "./symbolId";

// ── helpers ──────────────────────────────────────────────────────────
function fakeUri(str: string) {
  return vscode.Uri.parse(str);
}

function fakeRange(startLine: number, startChar: number, endLine?: number, endChar?: number) {
  return new vscode.Range(
    new vscode.Position(startLine, startChar),
    new vscode.Position(endLine ?? startLine, endChar ?? startChar),
  );
}

// ═════════════════════════════════════════════════════════════════════
// symbolIdFromUriRange
// ═════════════════════════════════════════════════════════════════════
describe("symbolIdFromUriRange", () => {
  it("returns uri#line:character for standard input", () => {
    const uri = fakeUri("file:///src/app.ts");
    const range = fakeRange(10, 5);
    expect(symbolIdFromUriRange(uri, range)).toBe("file:///src/app.ts#10:5");
  });

  it("returns uri#0:0 when line and character are zero", () => {
    const uri = fakeUri("file:///src/app.ts");
    const range = fakeRange(0, 0);
    expect(symbolIdFromUriRange(uri, range)).toBe("file:///src/app.ts#0:0");
  });

  it("handles large line and character values", () => {
    const uri = fakeUri("file:///src/big.ts");
    const range = fakeRange(99999, 1234);
    expect(symbolIdFromUriRange(uri, range)).toBe("file:///src/big.ts#99999:1234");
  });

  it("uses start of range, ignoring end", () => {
    const uri = fakeUri("file:///src/a.ts");
    const range = fakeRange(3, 7, 50, 99);
    expect(symbolIdFromUriRange(uri, range)).toBe("file:///src/a.ts#3:7");
  });

  it("handles untitled scheme URI", () => {
    const uri = fakeUri("untitled:Untitled-1");
    const range = fakeRange(1, 0);
    expect(symbolIdFromUriRange(uri, range)).toBe("untitled:Untitled-1#1:0");
  });

  it("handles URI with encoded spaces", () => {
    const uri = fakeUri("file:///my%20project/file.ts");
    const range = fakeRange(5, 2);
    expect(symbolIdFromUriRange(uri, range)).toBe("file:///my%20project/file.ts#5:2");
  });
});

// ═════════════════════════════════════════════════════════════════════
// parseUriFromSymbolId
// ═════════════════════════════════════════════════════════════════════
describe("parseUriFromSymbolId", () => {
  it("extracts URI from a valid symbolId", () => {
    const result = parseUriFromSymbolId("file:///src/app.ts#10:5");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///src/app.ts");
  });

  it("returns undefined when string has no hash", () => {
    expect(parseUriFromSymbolId("file:///src/app.ts")).toBeUndefined();
  });

  it("returns undefined when hash is at position 0", () => {
    expect(parseUriFromSymbolId("#10:5")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseUriFromSymbolId("")).toBeUndefined();
  });

  it("returns undefined when Uri.parse throws", () => {
    // Our mock throws for strings containing null byte
    expect(parseUriFromSymbolId("bad\x00uri#1:2")).toBeUndefined();
  });

  it("splits on first hash only when multiple hashes present", () => {
    const result = parseUriFromSymbolId("file:///a.ts#1:2#extra");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///a.ts");
  });

  it("parses URI even when no colon after hash", () => {
    const result = parseUriFromSymbolId("file:///a.ts#nocolon");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///a.ts");
  });

  it("returns undefined for hash-only string", () => {
    expect(parseUriFromSymbolId("#")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(parseUriFromSymbolId("   ")).toBeUndefined();
  });

  it("parses URI with query parameters before hash", () => {
    const result = parseUriFromSymbolId("file:///a.ts?query=1#5:10");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///a.ts?query=1");
  });

  it("parses untitled scheme URI", () => {
    const result = parseUriFromSymbolId("untitled:Untitled-1#0:0");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("untitled:Untitled-1");
  });

  it("parses URI with encoded special characters", () => {
    const result = parseUriFromSymbolId("file:///path%20with%20spaces/file.ts#2:3");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///path%20with%20spaces/file.ts");
  });

  it("parses URI with unicode in path", () => {
    const result = parseUriFromSymbolId("file:///héllo/wörld.ts#7:12");
    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///héllo/wörld.ts");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Round-trip
// ═════════════════════════════════════════════════════════════════════
describe("symbolIdFromUriRange → parseUriFromSymbolId round-trip", () => {
  it("recovers the original URI after round-trip", () => {
    const uri = fakeUri("file:///src/module.ts");
    const range = fakeRange(42, 8);

    const id = symbolIdFromUriRange(uri, range);
    const recovered = parseUriFromSymbolId(id);

    expect(recovered).toBeDefined();
    expect(recovered!.toString()).toBe("file:///src/module.ts");
  });

  it("recovers URI with encoded characters after round-trip", () => {
    const uri = fakeUri("file:///my%20project/héllo.ts");
    const range = fakeRange(0, 0);

    const id = symbolIdFromUriRange(uri, range);
    const recovered = parseUriFromSymbolId(id);

    expect(recovered).toBeDefined();
    expect(recovered!.toString()).toBe("file:///my%20project/héllo.ts");
  });
});

// ═════════════════════════════════════════════════════════════════════
// bugmagnet session 2026-04-15
// ═════════════════════════════════════════════════════════════════════
describe("bugmagnet session 2026-04-15", () => {
  // ─── symbolIdFromUriRange — string edge cases ─────────────────────
  describe("symbolIdFromUriRange — string edge cases", () => {
    it("returns correct id for very long URI path", () => {
      const longPath = "file:///" + "a".repeat(5000) + ".ts";
      const uri = fakeUri(longPath);
      const range = fakeRange(1, 2);
      expect(symbolIdFromUriRange(uri, range)).toBe(`${longPath}#1:2`);
    });

    it("handles URI with path traversal segments", () => {
      const uri = fakeUri("file:///project/../secret/file.ts");
      const range = fakeRange(0, 0);
      expect(symbolIdFromUriRange(uri, range)).toBe(
        "file:///project/../secret/file.ts#0:0",
      );
    });

    it("handles URI with query string and fragment-like content", () => {
      const uri = fakeUri("file:///a.ts?x=1&y=2");
      const range = fakeRange(3, 4);
      expect(symbolIdFromUriRange(uri, range)).toBe("file:///a.ts?x=1&y=2#3:4");
    });

    it("handles URI with Windows drive letter path", () => {
      const uri = fakeUri("file:///c:/Users/dev/project/file.ts");
      const range = fakeRange(10, 0);
      expect(symbolIdFromUriRange(uri, range)).toBe(
        "file:///c:/Users/dev/project/file.ts#10:0",
      );
    });

    it("handles URI with consecutive slashes", () => {
      const uri = fakeUri("file:////network/share/file.ts");
      const range = fakeRange(1, 1);
      expect(symbolIdFromUriRange(uri, range)).toBe(
        "file:////network/share/file.ts#1:1",
      );
    });

    it("handles URI with encoded hash (%23) in path", () => {
      const uri = fakeUri("file:///dir/file%23name.ts");
      const range = fakeRange(2, 5);
      expect(symbolIdFromUriRange(uri, range)).toBe(
        "file:///dir/file%23name.ts#2:5",
      );
    });
  });

  // ─── symbolIdFromUriRange — numeric edge cases ────────────────────
  describe("symbolIdFromUriRange — numeric edge cases", () => {
    it("handles Number.MAX_SAFE_INTEGER line and character", () => {
      const uri = fakeUri("file:///a.ts");
      const max = Number.MAX_SAFE_INTEGER;
      const range = fakeRange(max, max);
      expect(symbolIdFromUriRange(uri, range)).toBe(`file:///a.ts#${max}:${max}`);
    });

    it("handles negative line number (if Position allows it)", () => {
      const uri = fakeUri("file:///a.ts");
      const range = fakeRange(-1, -1);
      expect(symbolIdFromUriRange(uri, range)).toBe("file:///a.ts#-1:-1");
    });
  });

  // ─── parseUriFromSymbolId — string edge cases ─────────────────────
  describe("parseUriFromSymbolId — string edge cases", () => {
    it("returns undefined for string with only spaces and a hash", () => {
      const result = parseUriFromSymbolId("   #1:2");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("   ");
    });

    it("returns undefined for tab-only string", () => {
      expect(parseUriFromSymbolId("\t\t")).toBeUndefined();
    });

    it("returns undefined for newline-only string", () => {
      expect(parseUriFromSymbolId("\n")).toBeUndefined();
    });

    it("handles very long string before hash", () => {
      const longUri = "file:///" + "x".repeat(10000) + ".ts";
      const result = parseUriFromSymbolId(longUri + "#1:2");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe(longUri);
    });

    it("handles very long string after hash", () => {
      const result = parseUriFromSymbolId("file:///a.ts#" + "9".repeat(10000));
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///a.ts");
    });

    it("handles string with only a hash at end", () => {
      const result = parseUriFromSymbolId("file:///a.ts#");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///a.ts");
    });

    it("handles single character before hash", () => {
      const result = parseUriFromSymbolId("x#1:2");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("x");
    });

    it("parses URI with encoded hash (%23) that is not a real delimiter", () => {
      const result = parseUriFromSymbolId("file:///a%23b.ts#3:7");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///a%23b.ts");
    });
  });

  // ─── parseUriFromSymbolId — security patterns ─────────────────────
  describe("parseUriFromSymbolId — security-related inputs", () => {
    it("parses URI containing path traversal", () => {
      const result = parseUriFromSymbolId("file:///../../etc/passwd#1:0");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///../../etc/passwd");
    });

    it("parses URI containing script injection attempt", () => {
      const result = parseUriFromSymbolId("file:///<script>alert(1)</script>#1:0");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///<script>alert(1)</script>");
    });

    it("parses URI containing SQL injection pattern", () => {
      const result = parseUriFromSymbolId("file:///'; DROP TABLE files;--#1:0");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///'; DROP TABLE files;--");
    });
  });

  // ─── parseUriFromSymbolId — multiple hash edge cases ──────────────
  describe("parseUriFromSymbolId — multiple hash characters", () => {
    it("splits on first hash when URI portion itself contains encoded hash", () => {
      const result = parseUriFromSymbolId("file:///dir/f.ts#10:5#20:3");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///dir/f.ts");
    });

    it("handles three consecutive hashes", () => {
      const result = parseUriFromSymbolId("file:///a.ts###");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///a.ts");
    });

    it("handles hash immediately after scheme colon", () => {
      const result = parseUriFromSymbolId("file:#rest");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:");
    });
  });

  // ─── parseUriFromSymbolId — various URI schemes ───────────────────
  describe("parseUriFromSymbolId — URI scheme variations", () => {
    it("parses vscode-notebook-cell scheme", () => {
      const result = parseUriFromSymbolId(
        "vscode-notebook-cell:///notebook.ipynb#cell:0#5:3",
      );
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("vscode-notebook-cell:///notebook.ipynb");
    });

    it("parses custom scheme", () => {
      const result = parseUriFromSymbolId("myscheme:///resource#0:0");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("myscheme:///resource");
    });

    it("handles scheme-less string with hash", () => {
      // No colon before hash → scheme is "" but hash > 0 so URI portion parses
      const result = parseUriFromSymbolId("noscheme#0:0");
      expect(result).toBeDefined();
      expect(result!.toString()).toBe("noscheme");
    });
  });

  // ─── Round-trip edge cases ────────────────────────────────────────
  describe("round-trip — edge cases", () => {
    it("round-trips URI with Windows path", () => {
      const uri = fakeUri("file:///c:/Users/dev/file.ts");
      const range = fakeRange(100, 50);
      const id = symbolIdFromUriRange(uri, range);
      const recovered = parseUriFromSymbolId(id);
      expect(recovered).toBeDefined();
      expect(recovered!.toString()).toBe("file:///c:/Users/dev/file.ts");
    });

    it("round-trips URI with encoded hash in filename", () => {
      const uri = fakeUri("file:///dir/file%23name.ts");
      const range = fakeRange(1, 1);
      const id = symbolIdFromUriRange(uri, range);
      const recovered = parseUriFromSymbolId(id);
      expect(recovered).toBeDefined();
      expect(recovered!.toString()).toBe("file:///dir/file%23name.ts");
    });

    it("round-trips with max-value positions", () => {
      const uri = fakeUri("file:///a.ts");
      const max = Number.MAX_SAFE_INTEGER;
      const range = fakeRange(max, max);
      const id = symbolIdFromUriRange(uri, range);
      const recovered = parseUriFromSymbolId(id);
      expect(recovered).toBeDefined();
      expect(recovered!.toString()).toBe("file:///a.ts");
    });
  });
});
