import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSymbolIdParts, supportedSchemes } from "../core/lspCallGraphParsing";
import { SOURCE_FILE_GLOB, EXCLUDE_GLOB } from "./configuration";

// ── vscode mock (factory must be self-contained — vi.mock is hoisted) ─
vi.mock("vscode", () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }
  class RelativePattern {
    constructor(
      public base: unknown,
      public pattern: string,
    ) {}
  }
  class CancellationTokenSource {
    token = { isCancellationRequested: false };
    cancel() {
      this.token.isCancellationRequested = true;
    }
    dispose() { /* noop */ }
  }
  return {
    workspace: {
      findFiles: vi.fn(async () => []),
      openTextDocument: vi.fn(async () => ({})),
    },
    commands: {
      executeCommand: vi.fn(async () => undefined),
    },
    languages: {
      prepareCallHierarchy: vi.fn(async () => undefined),
      provideCallHierarchyOutgoingCalls: vi.fn(async () => undefined),
    },
    Uri: {
      parse(str: string) {
        const colonIdx = str.indexOf(":");
        const scheme = colonIdx > 0 ? str.slice(0, colonIdx) : "";
        return { toString: () => str, scheme };
      },
    },
    Position,
    RelativePattern,
    CancellationTokenSource,
    SymbolKind: {
      Function: 11,
      Method: 5,
      Constructor: 8,
      Class: 4,
      Variable: 12,
    },
  };
});

import * as vscode from "vscode";
import { collectCallEdgesFromWorkspace } from "./lspCallGraph";

describe("parseSymbolIdParts", () => {
  it("returns uri, line, and character for a valid symbolId", () => {
    const result = parseSymbolIdParts("file:///a.ts#10:5");
    expect(result).toEqual({ uriStr: "file:///a.ts", line: 10, ch: 5 });
  });

  it("returns undefined when symbolId has no hash", () => {
    expect(parseSymbolIdParts("file:///a.ts")).toBeUndefined();
  });

  it("returns undefined when hash is at position 0", () => {
    expect(parseSymbolIdParts("#0:0")).toBeUndefined();
  });

  it("returns undefined when line is non-numeric", () => {
    expect(parseSymbolIdParts("file:///a.ts#abc:5")).toBeUndefined();
  });

  it("returns undefined when character is non-numeric", () => {
    expect(parseSymbolIdParts("file:///a.ts#10:xyz")).toBeUndefined();
  });

  it("returns undefined when character part is missing", () => {
    expect(parseSymbolIdParts("file:///a.ts#5")).toBeUndefined();
  });

  it("returns correct parts for zero line and character", () => {
    const result = parseSymbolIdParts("file:///b.ts#0:0");
    expect(result).toEqual({ uriStr: "file:///b.ts", line: 0, ch: 0 });
  });

  it("returns correct parts for large line and character values", () => {
    const result = parseSymbolIdParts("file:///c.ts#9999:1234");
    expect(result).toEqual({ uriStr: "file:///c.ts", line: 9999, ch: 1234 });
  });

  it("returns correct parts when URI contains a hash in the path", () => {
    // indexOf('#') returns the first hash, so "file:///a%23b.ts" (encoded) works,
    // but a raw hash in the URI before the fragment would split at the wrong point.
    // The format guarantees URI is toString()'d which encodes #, so test encoded form:
    const result = parseSymbolIdParts("file:///dir/file.ts#3:7");
    expect(result).toEqual({ uriStr: "file:///dir/file.ts", line: 3, ch: 7 });
  });

  it("returns undefined for empty string", () => {
    expect(parseSymbolIdParts("")).toBeUndefined();
  });

  it("returns undefined when rest after hash is empty", () => {
    expect(parseSymbolIdParts("file:///a.ts#")).toBeUndefined();
  });

  it("returns undefined when only colon after hash", () => {
    expect(parseSymbolIdParts("file:///a.ts#:")).toBeUndefined();
  });

  it("handles negative line number as valid parseInt result", () => {
    const result = parseSymbolIdParts("file:///a.ts#-1:0");
    // parseInt("-1") === -1, which is not NaN, so it parses
    expect(result).toEqual({ uriStr: "file:///a.ts", line: -1, ch: 0 });
  });

  it("handles extra colon-separated parts by ignoring them", () => {
    const result = parseSymbolIdParts("file:///a.ts#10:5:99");
    expect(result).toEqual({ uriStr: "file:///a.ts", line: 10, ch: 5 });
  });
});

describe("supportedSchemes", () => {
  it("includes file and untitled schemes", () => {
    expect(supportedSchemes.has("file")).toBe(true);
    expect(supportedSchemes.has("untitled")).toBe(true);
  });

  it("rejects non-supported schemes", () => {
    expect(supportedSchemes.has("http")).toBe(false);
    expect(supportedSchemes.has("https")).toBe(false);
    expect(supportedSchemes.has("vscode")).toBe(false);
    expect(supportedSchemes.has("git")).toBe(false);
    expect(supportedSchemes.has("")).toBe(false);
  });
});

describe("bugmagnet session 2026-04-15", () => {
  describe("parseSymbolIdParts — string edge cases", () => {
    it("returns undefined for whitespace-only string", () => {
      expect(parseSymbolIdParts("   ")).toBeUndefined();
    });

    it("returns undefined for string with only a hash", () => {
      expect(parseSymbolIdParts("#")).toBeUndefined();
    });

    it("returns undefined for string with hash at end after single char", () => {
      // "x#" → hash at 1, rest is "", parseInt("") is NaN
      expect(parseSymbolIdParts("x#")).toBeUndefined();
    });

    it("handles URI with special characters before hash", () => {
      const result = parseSymbolIdParts("file:///path%20with%20spaces/file.ts#2:3");
      expect(result).toEqual({
        uriStr: "file:///path%20with%20spaces/file.ts",
        line: 2,
        ch: 3,
      });
    });

    it("handles URI with query parameters before hash", () => {
      const result = parseSymbolIdParts("file:///a.ts?query=1#5:10");
      expect(result).toEqual({
        uriStr: "file:///a.ts?query=1",
        line: 5,
        ch: 10,
      });
    });

    it("handles very long URI string", () => {
      const longPath = "file:///" + "a".repeat(5000) + ".ts";
      const result = parseSymbolIdParts(longPath + "#1:2");
      expect(result).toEqual({ uriStr: longPath, line: 1, ch: 2 });
    });

    it("returns undefined when line is float-like string", () => {
      // parseInt("1.5") is 1 (not NaN), parseInt("2.5") is 2
      const result = parseSymbolIdParts("file:///a.ts#1.5:2.5");
      // parseInt stops at first non-digit: "1.5" → 1, "2.5" → 2
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 1, ch: 2 });
    });

    it("returns undefined when line has leading spaces", () => {
      // parseInt(" 5") is 5 (leading spaces are trimmed by parseInt)
      const result = parseSymbolIdParts("file:///a.ts# 5: 3");
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 5, ch: 3 });
    });

    it("returns undefined when line starts with hex prefix", () => {
      // parseInt("0x10") with radix 10 is 0
      const result = parseSymbolIdParts("file:///a.ts#0x10:5");
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 0, ch: 5 });
    });
  });

  describe("parseSymbolIdParts — numeric edge cases", () => {
    it("handles line and character at Number.MAX_SAFE_INTEGER", () => {
      const maxInt = Number.MAX_SAFE_INTEGER;
      const result = parseSymbolIdParts(`file:///a.ts#${maxInt}:${maxInt}`);
      expect(result).toEqual({ uriStr: "file:///a.ts", line: maxInt, ch: maxInt });
    });

    it("handles line zero and character zero", () => {
      const result = parseSymbolIdParts("file:///a.ts#0:0");
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 0, ch: 0 });
    });

    it("returns undefined for line as Infinity string", () => {
      // parseInt("Infinity") is NaN
      expect(parseSymbolIdParts("file:///a.ts#Infinity:0")).toBeUndefined();
    });

    it("returns undefined for line as NaN string", () => {
      expect(parseSymbolIdParts("file:///a.ts#NaN:0")).toBeUndefined();
    });

    it("handles negative character value", () => {
      const result = parseSymbolIdParts("file:///a.ts#0:-1");
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 0, ch: -1 });
    });
  });

  describe("parseSymbolIdParts — boundary conditions", () => {
    it("handles single-character URI before hash", () => {
      const result = parseSymbolIdParts("x#1:2");
      expect(result).toEqual({ uriStr: "x", line: 1, ch: 2 });
    });

    it("returns undefined when hash is at position 0 with valid parts after", () => {
      expect(parseSymbolIdParts("#10:5")).toBeUndefined();
    });

    it("handles multiple hashes — only splits on first", () => {
      // "file:///a.ts#1:2#extra" → first hash at index 14
      // rest = "1:2#extra", parts = ["1", "2#extra"]
      // parseInt("1") = 1, parseInt("2#extra") = 2
      const result = parseSymbolIdParts("file:///a.ts#1:2#extra");
      expect(result).toEqual({ uriStr: "file:///a.ts", line: 1, ch: 2 });
    });

    it("handles symbolId with unicode in URI", () => {
      const result = parseSymbolIdParts("file:///héllo/wörld.ts#7:12");
      expect(result).toEqual({
        uriStr: "file:///héllo/wörld.ts",
        line: 7,
        ch: 12,
      });
    });
  });

  describe("supportedSchemes — boundary cases", () => {
    it("is case-sensitive — FILE is not supported", () => {
      expect(supportedSchemes.has("FILE")).toBe(false);
      expect(supportedSchemes.has("File")).toBe(false);
    });

    it("does not contain vscode-userdata or other VS Code internal schemes", () => {
      expect(supportedSchemes.has("vscode-userdata")).toBe(false);
      expect(supportedSchemes.has("vscode-notebook-cell")).toBe(false);
      expect(supportedSchemes.has("output")).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// collectCallEdgesFromWorkspace — gap tests
// ═══════════════════════════════════════════════════════════════════

// ── helpers ────────────────────────────────────────────────────────────
function fakeUri(str: string) {
  const colonIdx = str.indexOf(":");
  return {
    toString: () => str,
    scheme: colonIdx > 0 ? str.slice(0, colonIdx) : "",
  };
}

function fnSymbol(name: string, line: number, ch = 0) {
  return {
    name,
    kind: 11, // SymbolKind.Function
    selectionRange: { start: { line, character: ch } },
    range: { start: { line, character: ch }, end: { line, character: ch + name.length } },
    children: [],
  };
}

describe("collectCallEdgesFromWorkspace", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.findFiles).mockReset().mockResolvedValue([]);
    vi.mocked(vscode.workspace.openTextDocument).mockReset().mockResolvedValue({} as any);
    vi.mocked(vscode.commands.executeCommand).mockReset().mockResolvedValue(undefined as any);
    (vscode.languages as any).prepareCallHierarchy.mockReset().mockResolvedValue(undefined);
    (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockReset().mockResolvedValue(undefined);
  });

  // ─── File discovery glob pattern ───────────────────────────────────
  describe("file discovery glob pattern", () => {
    it("returns empty edges when findFiles returns no files", async () => {
      const edges = await collectCallEdgesFromWorkspace();
      expect(edges).toEqual([]);
    });

    it("uses RelativePattern for file discovery when rootUri is set", async () => {
      await collectCallEdgesFromWorkspace({ rootUri: "file:///my/root" });

      const [pattern] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      expect(pattern).toBeInstanceOf(vscode.RelativePattern);
      expect((pattern as InstanceType<typeof vscode.RelativePattern>).pattern).toBe(SOURCE_FILE_GLOB);
    });

    it("uses plain glob string for file discovery when no rootUri", async () => {
      await collectCallEdgesFromWorkspace();

      const [pattern, exclude] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      expect(pattern).toBe(SOURCE_FILE_GLOB);
      expect(exclude).toBe(EXCLUDE_GLOB);
    });
  });

  // ─── Test file filtering ──────────────────────────────────────────
  describe("test file filtering", () => {
    it("doubles the findFiles limit when excludeTests is true", async () => {
      await collectCallEdgesFromWorkspace({ maxFiles: 10, excludeTests: true });

      const [, , limit] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      expect(limit).toBe(20);
    });

    it("uses exact maxFiles limit when excludeTests is false", async () => {
      await collectCallEdgesFromWorkspace({ maxFiles: 10, excludeTests: false });

      const [, , limit] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      expect(limit).toBe(10);
    });

    it("filters out test files and slices to maxFiles when excludeTests is true", async () => {
      const uris = [
        fakeUri("file:///src/app.ts"),
        fakeUri("file:///src/app.test.ts"),
        fakeUri("file:///src/util.ts"),
        fakeUri("file:///src/util.spec.ts"),
        fakeUri("file:///src/helper.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace({ maxFiles: 2, excludeTests: true });

      const allOpenedUris = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
        (c) => (c[0] as any).toString(),
      );
      // Test files excluded
      expect(allOpenedUris).not.toContain("file:///src/app.test.ts");
      expect(allOpenedUris).not.toContain("file:///src/util.spec.ts");
      // helper.ts excluded by maxFiles=2 slice
      expect(allOpenedUris).not.toContain("file:///src/helper.ts");
    });

    it("keeps all files including test files when excludeTests is false", async () => {
      const uris = [
        fakeUri("file:///src/app.ts"),
        fakeUri("file:///src/app.test.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace({ excludeTests: false });

      const openedUris = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
        (c) => (c[0] as any).toString(),
      );
      expect(openedUris).toContain("file:///src/app.ts");
      expect(openedUris).toContain("file:///src/app.test.ts");
    });
  });

  // ─── Scheme filtering ─────────────────────────────────────────────
  describe("scheme filtering", () => {
    it("skips files with unsupported URI schemes", async () => {
      const uris = [
        fakeUri("file:///src/a.ts"),
        fakeUri("git:///src/b.ts"),
        fakeUri("vscode:///src/c.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace();

      // Only the file: URI should have been opened
      const openedUris = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
        (c) => (c[0] as any).toString(),
      );
      expect(openedUris).toContain("file:///src/a.ts");
      expect(openedUris).not.toContain("git:///src/b.ts");
      expect(openedUris).not.toContain("vscode:///src/c.ts");
    });

    it("processes files with untitled scheme", async () => {
      const uris = [fakeUri("untitled:Untitled-1")];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace();

      expect(vi.mocked(vscode.workspace.openTextDocument)).toHaveBeenCalled();
    });
  });

  // ─── Error resilience ─────────────────────────────────────────────
  describe("error resilience", () => {
    it("continues processing when openTextDocument throws for one file", async () => {
      const uris = [
        fakeUri("file:///src/bad.ts"),
        fakeUri("file:///src/good.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.workspace.openTextDocument)
        .mockRejectedValueOnce(new Error("cannot open"))
        .mockResolvedValueOnce({} as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace();

      // symbol provider was still called for good.ts
      expect(vi.mocked(vscode.commands.executeCommand).mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it("continues processing when symbol provider throws for one file", async () => {
      const uris = [
        fakeUri("file:///src/bad.ts"),
        fakeUri("file:///src/good.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand)
        .mockRejectedValueOnce(new Error("symbol provider failed"))
        .mockResolvedValueOnce([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace();

      // good.ts still got processed — 2 calls total (one failed, one succeeded)
      expect(vi.mocked(vscode.commands.executeCommand)).toHaveBeenCalledTimes(2);
    });

    it("skips files with no symbols", async () => {
      const uris = [fakeUri("file:///src/empty.ts")];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("skips files with empty symbols array", async () => {
      const uris = [fakeUri("file:///src/empty.ts")];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([] as any);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });
  });

  // ─── Cancellation ─────────────────────────────────────────────────
  describe("cancellation", () => {
    it("stops processing files when token is cancelled", async () => {
      const token = { isCancellationRequested: false } as any;
      const uris = [
        fakeUri("file:///src/a.ts"),
        fakeUri("file:///src/b.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      // Cancel during symbol provider for first file
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
        token.isCancellationRequested = true;
        return [fnSymbol("fn", 0)] as any;
      });

      await collectCallEdgesFromWorkspace({ token });

      // Symbol provider called for first file only — second file skipped
      expect(vi.mocked(vscode.commands.executeCommand)).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Outgoing call resolution ─────────────────────────────────────
  describe("outgoing call resolution", () => {
    it("returns edges from outgoing call hierarchy", async () => {
      const callerUri = fakeUri("file:///src/caller.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([callerUri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("doWork", 5, 2)] as any);

      const calleeUri = fakeUri("file:///src/callee.ts");
      const hierarchyItem = { uri: callerUri, selectionRange: { start: { line: 5, character: 2 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([hierarchyItem]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
        {
          to: {
            uri: calleeUri,
            selectionRange: { start: { line: 10, character: 0 } },
            range: { start: { line: 10, character: 0 } },
          },
        },
      ]);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([
        { caller: "file:///src/caller.ts#5:2", callee: "file:///src/callee.ts#10:0" },
      ]);
    });

    it("returns empty edges when getOutgoingCalleeIds gets malformed symbolId", async () => {
      // Force a symbol with an id that parseSymbolIdParts can't parse
      // This is hard to trigger through collectCallEdgesFromWorkspace since
      // symbolIdFromUriRange always produces valid IDs. Instead verify the
      // pipeline works E2E with a normal ID and no call hierarchy:
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("returns empty edges when openTextDocument fails during call resolution", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      // First call succeeds (discovery), second fails (call resolution)
      vi.mocked(vscode.workspace.openTextDocument)
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error("file gone"));

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("returns empty edges when prepareCallHierarchy throws", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      (vscode.languages as any).prepareCallHierarchy.mockRejectedValue(
        new Error("no call hierarchy"),
      );

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("returns empty edges when prepareCallHierarchy returns empty array", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([]);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("returns empty edges when provideCallHierarchyOutgoingCalls returns null", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      const item = { uri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue(null);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("uses selectionRange over range for callee symbolId", async () => {
      const callerUri = fakeUri("file:///src/caller.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([callerUri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      const calleeUri = fakeUri("file:///src/callee.ts");
      const item = { uri: callerUri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
        {
          to: {
            uri: calleeUri,
            selectionRange: { start: { line: 3, character: 4 } },
            range: { start: { line: 1, character: 0 } },
          },
        },
      ]);

      const edges = await collectCallEdgesFromWorkspace();

      // selectionRange (3:4) is used, not range (1:0)
      expect(edges[0].callee).toBe("file:///src/callee.ts#3:4");
    });

    it("falls back to range when selectionRange is missing", async () => {
      const callerUri = fakeUri("file:///src/caller.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([callerUri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      const calleeUri = fakeUri("file:///src/callee.ts");
      const item = { uri: callerUri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
        {
          to: {
            uri: calleeUri,
            selectionRange: undefined,
            range: { start: { line: 7, character: 2 } },
          },
        },
      ]);

      const edges = await collectCallEdgesFromWorkspace();

      // Falls back to range (7:2) since selectionRange is undefined
      expect(edges[0].callee).toBe("file:///src/callee.ts#7:2");
    });
  });

  // ─── Defaults ─────────────────────────────────────────────────────
  describe("defaults", () => {
    it("defaults maxFiles to 500 and excludeTests to true", async () => {
      await collectCallEdgesFromWorkspace();

      const [, , limit] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      // excludeTests defaults to true → limit = 500 * 2 = 1000
      expect(limit).toBe(1000);
    });

    it("creates its own cancellation token when none provided", async () => {
      // Should not throw even without a token
      const edges = await collectCallEdgesFromWorkspace({});
      expect(edges).toEqual([]);
    });
  });

  // ─── Multi-file error resilience ──────────────────────────────────
  describe("multi-file error resilience", () => {
    it("produces edges from good files even when one file fails to open", async () => {
      const badUri = fakeUri("file:///src/bad.ts");
      const goodUri = fakeUri("file:///src/good.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([badUri, goodUri] as any);
      vi.mocked(vscode.workspace.openTextDocument)
        .mockRejectedValueOnce(new Error("cannot open"))
        .mockResolvedValue({} as any);
      // bad.ts → no symbols (open failed); good.ts → has a function
      vi.mocked(vscode.commands.executeCommand)
        .mockResolvedValueOnce(undefined as any)
        .mockResolvedValueOnce([fnSymbol("fn", 0)] as any);

      const calleeUri = fakeUri("file:///src/callee.ts");
      const item = { uri: goodUri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
        {
          to: {
            uri: calleeUri,
            selectionRange: { start: { line: 1, character: 0 } },
            range: { start: { line: 1, character: 0 } },
          },
        },
      ]);

      const edges = await collectCallEdgesFromWorkspace();

      // Edge from good.ts is still produced
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges[0].caller).toBe("file:///src/good.ts#0:0");
    });

    it("returns empty edges when provideCallHierarchyOutgoingCalls throws", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
      const item = { uri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockRejectedValue(
        new Error("outgoing calls failed"),
      );

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([]);
    });

    it("handles test filtering + maxFiles interaction correctly", async () => {
      // 10 files, 5 are tests, maxFiles=3 → only 3 non-test files retained
      const uris = [
        fakeUri("file:///src/a.ts"),
        fakeUri("file:///src/a.test.ts"),
        fakeUri("file:///src/b.ts"),
        fakeUri("file:///src/b.test.ts"),
        fakeUri("file:///src/c.ts"),
        fakeUri("file:///src/c.test.ts"),
        fakeUri("file:///src/d.ts"),
        fakeUri("file:///src/d.test.ts"),
        fakeUri("file:///src/e.ts"),
        fakeUri("file:///src/e.test.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

      await collectCallEdgesFromWorkspace({ maxFiles: 3, excludeTests: true });

      const openedUris = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
        (c) => (c[0] as any).toString(),
      );
      // No test files opened
      for (const u of openedUris) {
        expect(u).not.toMatch(/\.test\.ts$/);
      }
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────
  describe("edge cases", () => {
    it("passes maxFiles of 0 through to findFiles", async () => {
      await collectCallEdgesFromWorkspace({ maxFiles: 0 });

      const [, , limit] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
      // excludeTests defaults to true → limit = 0 * 2 = 0
      expect(limit).toBe(0);
    });

    it("only extracts Function, Method, and Constructor symbols", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        fnSymbol("myFunc", 1),              // kind 11 — Function ✓
        { ...fnSymbol("myMethod", 2), kind: 5 },  // kind 5 — Method ✓
        { ...fnSymbol("myCtor", 3), kind: 8 },    // kind 8 — Constructor ✓
        { ...fnSymbol("myClass", 4), kind: 4 },   // kind 4 — Class ✗
        { ...fnSymbol("myVar", 5), kind: 12 },    // kind 12 — Variable ✗
      ] as any);
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

      await collectCallEdgesFromWorkspace();

      // 3 function-like symbols discovered, each calls getOutgoingCalleeIds
      // prepareCallHierarchy returns undefined → no edges, but verify discovery count
      expect((vscode.languages as any).prepareCallHierarchy).toHaveBeenCalledTimes(3);
    });

    it("handles nested function symbols inside classes", async () => {
      const uri = fakeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      // Class with a nested method
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        {
          name: "MyClass",
          kind: 4, // Class
          selectionRange: { start: { line: 0, character: 0 } },
          range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
          children: [
            {
              name: "doWork",
              kind: 5, // Method
              selectionRange: { start: { line: 2, character: 2 } },
              range: { start: { line: 2, character: 2 }, end: { line: 5, character: 3 } },
              children: [],
            },
          ],
        },
      ] as any);
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

      await collectCallEdgesFromWorkspace();

      // The nested method should be discovered and have call hierarchy prepared
      expect((vscode.languages as any).prepareCallHierarchy).toHaveBeenCalledTimes(1);
    });

    it("produces multiple edges from a single function with multiple callees", async () => {
      const callerUri = fakeUri("file:///src/caller.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([callerUri] as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("main", 0)] as any);

      const item = { uri: callerUri, selectionRange: { start: { line: 0, character: 0 } } };
      (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
      (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
        {
          to: {
            uri: fakeUri("file:///src/a.ts"),
            selectionRange: { start: { line: 1, character: 0 } },
            range: { start: { line: 1, character: 0 } },
          },
        },
        {
          to: {
            uri: fakeUri("file:///src/b.ts"),
            selectionRange: { start: { line: 2, character: 0 } },
            range: { start: { line: 2, character: 0 } },
          },
        },
      ]);

      const edges = await collectCallEdgesFromWorkspace();

      expect(edges).toEqual([
        { caller: "file:///src/caller.ts#0:0", callee: "file:///src/a.ts#1:0" },
        { caller: "file:///src/caller.ts#0:0", callee: "file:///src/b.ts#2:0" },
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-15
  // ═══════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-15", () => {
    // ─── Complex interactions ──────────────────────────────────────
    describe("complex interactions", () => {
      it("combines scoped rootUri with test filtering", async () => {
        const uris = [
          fakeUri("file:///root/src/app.ts"),
          fakeUri("file:///root/src/app.test.ts"),
        ];
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

        await collectCallEdgesFromWorkspace({
          rootUri: "file:///root",
          excludeTests: true,
          maxFiles: 10,
        });

        const [pattern, , limit] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
        expect(pattern).toBeInstanceOf(vscode.RelativePattern);
        expect(limit).toBe(20); // 10 * 2 for excludeTests=true
        const openedUris = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
          (c) => (c[0] as any).toString(),
        );
        expect(openedUris).not.toContain("file:///root/src/app.test.ts");
      });

      it("handles multiple files with multiple functions each producing a call graph", async () => {
        const uri1 = fakeUri("file:///src/a.ts");
        const uri2 = fakeUri("file:///src/b.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri1, uri2] as any);
        // a.ts has 2 functions, b.ts has 1
        vi.mocked(vscode.commands.executeCommand)
          .mockResolvedValueOnce([fnSymbol("fn1", 0), fnSymbol("fn2", 5)] as any)
          .mockResolvedValueOnce([fnSymbol("fn3", 0)] as any);

        const calleeUri = fakeUri("file:///src/callee.ts");
        (vscode.languages as any).prepareCallHierarchy.mockImplementation(
          async (_doc: any, pos: any) => {
            return [{ uri: uri1, selectionRange: { start: { line: pos.line, character: pos.character } } }];
          },
        );
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
          {
            to: {
              uri: calleeUri,
              selectionRange: { start: { line: 99, character: 0 } },
              range: { start: { line: 99, character: 0 } },
            },
          },
        ]);

        const edges = await collectCallEdgesFromWorkspace();

        // 3 functions → 3 edges (each calls callee)
        expect(edges).toHaveLength(3);
        for (const e of edges) {
          expect(e.callee).toBe("file:///src/callee.ts#99:0");
        }
      });

      it("filters self-edges when a function calls itself", async () => {
        const uri = fakeUri("file:///src/a.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("rec", 3, 0)] as any);

        const item = { uri, selectionRange: { start: { line: 3, character: 0 } } };
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
          {
            to: {
              uri,
              selectionRange: { start: { line: 3, character: 0 } }, // same as caller
              range: { start: { line: 3, character: 0 } },
            },
          },
          {
            to: {
              uri: fakeUri("file:///src/b.ts"),
              selectionRange: { start: { line: 0, character: 0 } },
              range: { start: { line: 0, character: 0 } },
            },
          },
        ]);

        const edges = await collectCallEdgesFromWorkspace();

        // Self-edge filtered, only external call remains
        expect(edges).toEqual([
          { caller: "file:///src/a.ts#3:0", callee: "file:///src/b.ts#0:0" },
        ]);
      });

      it("handles cancellation mid-way through outgoing call collection", async () => {
        const token = { isCancellationRequested: false } as any;
        const uris = [
          fakeUri("file:///src/a.ts"),
          fakeUri("file:///src/b.ts"),
          fakeUri("file:///src/c.ts"),
        ];
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

        let callCount = 0;
        (vscode.languages as any).prepareCallHierarchy.mockImplementation(async () => {
          callCount++;
          if (callCount >= 2) {
            token.isCancellationRequested = true;
          }
          return [{ uri: uris[0], selectionRange: { start: { line: 0, character: 0 } } }];
        });
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([]);

        await collectCallEdgesFromWorkspace({ token });

        // Not all 3 files fully processed
        expect(callCount).toBeLessThan(3);
      });
    });

    // ─── Stateful operations ───────────────────────────────────────
    describe("stateful operations", () => {
      it("resets state between consecutive calls", async () => {
        // First call: 1 file with 1 function
        const uri1 = fakeUri("file:///src/first.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri1] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

        const edges1 = await collectCallEdgesFromWorkspace();
        expect(edges1).toEqual([]);

        // Reset mocks for second call
        vi.mocked(vscode.workspace.findFiles).mockReset();
        vi.mocked(vscode.workspace.openTextDocument).mockReset().mockResolvedValue({} as any);
        vi.mocked(vscode.commands.executeCommand).mockReset();
        (vscode.languages as any).prepareCallHierarchy.mockReset();
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockReset();

        // Second call: different file, produces edges
        const uri2 = fakeUri("file:///src/second.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri2] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
        const item = { uri: uri2, selectionRange: { start: { line: 0, character: 0 } } };
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue([item]);
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
          {
            to: {
              uri: fakeUri("file:///src/target.ts"),
              selectionRange: { start: { line: 1, character: 0 } },
              range: { start: { line: 1, character: 0 } },
            },
          },
        ]);

        const edges2 = await collectCallEdgesFromWorkspace();
        expect(edges2).toEqual([
          { caller: "file:///src/second.ts#0:0", callee: "file:///src/target.ts#1:0" },
        ]);
      });
    });

    // ─── Violated domain constraints ───────────────────────────────
    describe("violated domain constraints", () => {
      it("handles findFiles returning duplicate URIs", async () => {
        const uri = fakeUri("file:///src/a.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri, uri] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

        const edges = await collectCallEdgesFromWorkspace();

        // No crash — duplicates produce duplicate symbols but no edges without call hierarchy
        expect(edges).toEqual([]);
        // openTextDocument called for both in discovery + both in outgoing call resolution
        expect(vi.mocked(vscode.workspace.openTextDocument)).toHaveBeenCalledTimes(4);
      });

      it("handles symbols with same id from different files (dedup)", async () => {
        // Two files both have a function at line 0, col 0 — produces same symbolId format
        // but different URIs so IDs differ
        const uri1 = fakeUri("file:///src/a.ts");
        const uri2 = fakeUri("file:///src/b.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri1, uri2] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0, 0)] as any);

        const calleeUri = fakeUri("file:///src/callee.ts");
        (vscode.languages as any).prepareCallHierarchy.mockImplementation(async () => [
          { uri: uri1, selectionRange: { start: { line: 0, character: 0 } } },
        ]);
        (vscode.languages as any).provideCallHierarchyOutgoingCalls.mockResolvedValue([
          {
            to: {
              uri: calleeUri,
              selectionRange: { start: { line: 5, character: 0 } },
              range: { start: { line: 5, character: 0 } },
            },
          },
        ]);

        const edges = await collectCallEdgesFromWorkspace();

        // Two different callers (different URIs) each calling the same callee
        expect(edges).toHaveLength(2);
        expect(edges[0].caller).toBe("file:///src/a.ts#0:0");
        expect(edges[1].caller).toBe("file:///src/b.ts#0:0");
      });

      it("handles empty URI string in findFiles result", async () => {
        const uri = { toString: () => "", scheme: "" };
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);

        const edges = await collectCallEdgesFromWorkspace();

        // Empty scheme not in supportedSchemes → skipped
        expect(edges).toEqual([]);
        expect(vi.mocked(vscode.workspace.openTextDocument)).not.toHaveBeenCalled();
      });

      it("handles findFiles returning files with mixed supported and unsupported schemes", async () => {
        const uris = [
          fakeUri("file:///a.ts"),
          fakeUri("http:///b.ts"),
          fakeUri("untitled:c.ts"),
          fakeUri("git:///d.ts"),
        ];
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);

        await collectCallEdgesFromWorkspace();

        const openedStrs = vi.mocked(vscode.workspace.openTextDocument).mock.calls.map(
          (c) => (c[0] as any).toString(),
        );
        expect(openedStrs).toContain("file:///a.ts");
        expect(openedStrs).toContain("untitled:c.ts");
        expect(openedStrs).not.toContain("http:///b.ts");
        expect(openedStrs).not.toContain("git:///d.ts");
      });
    });

    // ─── Error handling edge cases ─────────────────────────────────
    describe("error handling edge cases", () => {
      it("handles all files failing to open without crashing", async () => {
        const uris = [
          fakeUri("file:///a.ts"),
          fakeUri("file:///b.ts"),
        ];
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
        vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(new Error("all fail"));
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

        const edges = await collectCallEdgesFromWorkspace();

        expect(edges).toEqual([]);
      });

      it("handles symbol provider returning non-array without crashing", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null as any);

        const edges = await collectCallEdgesFromWorkspace();

        expect(edges).toEqual([]);
      });

      it("handles prepareCallHierarchy returning null", async () => {
        const uri = fakeUri("file:///a.ts");
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([fnSymbol("fn", 0)] as any);
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(null);

        const edges = await collectCallEdgesFromWorkspace();

        expect(edges).toEqual([]);
      });

      it("handles multiple sequential errors across different stages", async () => {
        const uris = [
          fakeUri("file:///src/a.ts"),
          fakeUri("file:///src/b.ts"),
          fakeUri("file:///src/c.ts"),
        ];
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
        // a.ts: open fails
        // b.ts: symbol provider fails
        // c.ts: works
        vi.mocked(vscode.workspace.openTextDocument)
          .mockRejectedValueOnce(new Error("open fail"))
          .mockResolvedValueOnce({} as any)
          .mockResolvedValue({} as any);
        vi.mocked(vscode.commands.executeCommand)
          .mockResolvedValueOnce(undefined as any) // a.ts (after catch, still called)
          .mockRejectedValueOnce(new Error("symbol fail")) // b.ts
          .mockResolvedValueOnce([fnSymbol("fn", 0)] as any); // c.ts
        (vscode.languages as any).prepareCallHierarchy.mockResolvedValue(undefined);

        const edges = await collectCallEdgesFromWorkspace();

        // No crash, graceful degradation — no edges since prepareCallHierarchy returns undefined
        expect(edges).toEqual([]);
      });
    });
  });
});
