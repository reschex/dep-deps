import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock (factory must be self-contained — vi.mock is hoisted) ─
vi.mock("vscode", () => {
  class Uri {
    scheme: string;
    fsPath: string;
    private _str: string;

    private constructor(scheme: string, fsPath: string, str: string) {
      this.scheme = scheme;
      this.fsPath = fsPath;
      this._str = str;
    }

    toString() {
      return this._str;
    }

    static parse(str: string): Uri {
      const colonIdx = str.indexOf(":");
      const scheme = colonIdx > 0 ? str.slice(0, colonIdx) : "";
      // Simplified fsPath extraction for file:// URIs
      let fsPath = "";
      if (scheme === "file") {
        const path = str.replace("file:///", "").replace(/%3A/gi, ":");
        fsPath = path.replace(/\//g, "\\");
      }
      return new Uri(scheme, fsPath, str);
    }

    static file(path: string): Uri {
      const encoded = path.replace(/\\/g, "/");
      return new Uri("file", path, `file:///${encoded}`);
    }
  }

  class Range {
    constructor(
      public startLine: number,
      public startCharacter: number,
      public endLine: number,
      public endCharacter: number,
    ) {}
  }

  class RelativePattern {
    constructor(
      public baseUri: unknown,
      public pattern: string,
    ) {}
  }

  return {
    Uri,
    Range,
    RelativePattern,
    workspace: {
      findFiles: vi.fn(async () => []),
      openTextDocument: vi.fn(async () => ({})),
      getWorkspaceFolder: vi.fn(() => undefined),
    },
    commands: {
      executeCommand: vi.fn(async () => undefined),
    },
    SymbolKind: {
      Function: 11,
      Method: 5,
      Constructor: 8,
    },
  };
});

// ── Mock dependency modules ──────────────────────────────────────────
vi.mock("./documentSymbols", () => ({
  flattenFunctionSymbols: vi.fn(() => []),
}));

vi.mock("./lspCallGraph", () => ({
  collectCallEdgesFromWorkspace: vi.fn(async () => []),
}));

vi.mock("./coverageStore", () => ({
  CoverageStore: vi.fn(),
  loadLcovIntoStore: vi.fn(async () => {}),
}));

vi.mock("./cc/eslintComplexity", () => ({
  eslintCcForFile: vi.fn(async () => new Map()),
}));

vi.mock("./cc/radonCc", () => ({
  radonCcForFile: vi.fn(async () => new Map()),
}));

vi.mock("./cc/pmdComplexity", () => ({
  pmdCcForFile: vi.fn(async () => new Map()),
}));

vi.mock("./configuration", () => ({
  SOURCE_FILE_GLOB: "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}",
  EXCLUDE_GLOB: "**/node_modules/**",
  isTestFileUri: vi.fn((uri: string) => /\.test\.|\.spec\.|__tests__/i.test(uri)),
}));

// ── Imports (after mocks) ────────────────────────────────────────────
import * as vscode from "vscode";
import {
  VsCodeDocumentProvider,
  VsCodeSymbolProvider,
  VsCodeCallGraphProvider,
  VsCodeCoverageProvider,
  EslintCcProvider,
  RadonCcProvider,
  PmdCcProvider,
  VsCodeLogger,
} from "./adapters";
import { flattenFunctionSymbols } from "./documentSymbols";
import { collectCallEdgesFromWorkspace } from "./lspCallGraph";
import { loadLcovIntoStore } from "./coverageStore";
import { eslintCcForFile } from "./cc/eslintComplexity";
import { radonCcForFile } from "./cc/radonCc";
import { pmdCcForFile } from "./cc/pmdComplexity";
import { isTestFileUri } from "./configuration";
import type { DocumentInfo } from "../core/ports";

// ── Helpers ──────────────────────────────────────────────────────────
function fakeUri(str: string) {
  return vscode.Uri.parse(str);
}

function fakeVscodeUri(uriStr: string, scheme = "file") {
  const u = fakeUri(uriStr);
  return { toString: () => uriStr, scheme: u.scheme || scheme, fsPath: u.fsPath };
}

function fakeToken(cancelled = false): vscode.CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: vi.fn(),
  };
}

function fakeDoc(uriStr: string, languageId: string): DocumentInfo {
  return {
    uri: uriStr,
    languageId,
    getText: () => "",
  };
}

// ═════════════════════════════════════════════════════════════════════
// VsCodeDocumentProvider
// ═════════════════════════════════════════════════════════════════════
describe("VsCodeDocumentProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── constructor defaults ────────────────────────────────────────
  describe("constructor", () => {
    it("defaults excludeTests to true", async () => {
      const fileUri = fakeVscodeUri("file:///src/foo.test.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([fileUri as any]);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.findSourceFiles(10);

      // Test files should be filtered out
      expect(result).toEqual([]);
    });

    it("includes test files when excludeTests is false", async () => {
      const testUri = fakeVscodeUri("file:///src/foo.test.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([testUri as any]);
      vi.mocked(isTestFileUri).mockReturnValue(true);

      const provider = new VsCodeDocumentProvider(false);
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///src/foo.test.ts"]);
    });
  });

  // ─── findSourceFiles ─────────────────────────────────────────────
  describe("findSourceFiles", () => {
    it("returns file:// URIs as strings", async () => {
      const uri1 = fakeVscodeUri("file:///src/a.ts");
      const uri2 = fakeVscodeUri("file:///src/b.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri1, uri2] as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///src/a.ts", "file:///src/b.ts"]);
    });

    it("filters out non-file scheme URIs", async () => {
      const fileUri = fakeVscodeUri("file:///src/a.ts");
      const untitledUri = { toString: () => "untitled:Untitled-1", scheme: "untitled", fsPath: "" };
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([fileUri, untitledUri] as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///src/a.ts"]);
    });

    it("filters out test files when excludeTests is true", async () => {
      const srcUri = fakeVscodeUri("file:///src/a.ts");
      const testUri = fakeVscodeUri("file:///src/a.test.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([srcUri, testUri] as any);
      vi.mocked(isTestFileUri).mockImplementation((u) => u.includes(".test."));

      const provider = new VsCodeDocumentProvider(true);
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///src/a.ts"]);
    });

    it("keeps test files when excludeTests is false", async () => {
      const srcUri = fakeVscodeUri("file:///src/a.ts");
      const testUri = fakeVscodeUri("file:///src/a.test.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([srcUri, testUri] as any);

      const provider = new VsCodeDocumentProvider(false);
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///src/a.ts", "file:///src/a.test.ts"]);
    });

    it("requests maxFiles * 2 limit when excludeTests is true", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(true);
      await provider.findSourceFiles(5);

      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        10,
      );
    });

    it("requests exact maxFiles limit when excludeTests is false", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(5);

      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        5,
      );
    });

    it("truncates result to maxFiles after filtering", async () => {
      const uris = Array.from({ length: 20 }, (_, i) =>
        fakeVscodeUri(`file:///src/f${i}.ts`)
      );
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider(true);
      const result = await provider.findSourceFiles(3);

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        "file:///src/f0.ts",
        "file:///src/f1.ts",
        "file:///src/f2.ts",
      ]);
    });

    it("passes raw glob string when rootUri is undefined", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(10);

      // First argument should be a string (not a RelativePattern)
      const pattern = vi.mocked(vscode.workspace.findFiles).mock.calls[0][0];
      expect(typeof pattern).toBe("string");
    });

    it("passes RelativePattern when rootUri is provided", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(10, "file:///c%3A/code/src");

      const pattern = vi.mocked(vscode.workspace.findFiles).mock.calls[0][0];
      expect(typeof pattern).not.toBe("string");
      expect(pattern).toHaveProperty("pattern");
    });
  });

  // ─── openDocument ────────────────────────────────────────────────
  describe("openDocument", () => {
    it("returns DocumentInfo with uri and languageId from opened document", async () => {
      const mockDoc = {
        uri: fakeUri("file:///src/a.ts"),
        languageId: "typescript",
        lineAt: () => ({ text: "mock line" }),
        getText: () => "full text",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDoc as any);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///src/a.ts");

      expect(result).toBeDefined();
      expect(result!.uri).toBe("file:///src/a.ts");
      expect(result!.languageId).toBe("typescript");
    });

    it("returns DocumentInfo with working getText method", async () => {
      const mockDoc = {
        uri: fakeUri("file:///src/a.ts"),
        languageId: "typescript",
        lineAt: (line: number) => ({ text: `line ${line} content` }),
        getText: (range: any) => `text from ${range.startLine} to ${range.endLine}`,
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDoc as any);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///src/a.ts");

      expect(result).toBeDefined();
      // The getText method should create a Range and call doc.getText
      const text = result!.getText(0, 5);
      expect(text).toBeDefined();
    });

    it("returns undefined when openTextDocument throws", async () => {
      vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(new Error("not found"));

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///missing.ts");

      expect(result).toBeUndefined();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// VsCodeSymbolProvider
// ═════════════════════════════════════════════════════════════════════
describe("VsCodeSymbolProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped FunctionSymbolInfo array from flattenFunctionSymbols output", async () => {
    const fakeSymbol = {
      name: "doWork",
      selectionRange: { start: { line: 10, character: 5 } },
      range: { start: { line: 9 }, end: { line: 25 } },
    };
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{}] as any);
    vi.mocked(flattenFunctionSymbols).mockReturnValue([fakeSymbol as any]);

    const provider = new VsCodeSymbolProvider();
    const result = await provider.getFunctionSymbols("file:///src/a.ts");

    expect(result).toEqual([{
      name: "doWork",
      selectionStartLine: 10,
      selectionStartCharacter: 5,
      bodyStartLine: 9,
      bodyEndLine: 25,
    }]);
  });

  it("returns multiple symbols when flattenFunctionSymbols returns multiple", async () => {
    const syms = [
      {
        name: "fn1",
        selectionRange: { start: { line: 1, character: 0 } },
        range: { start: { line: 0 }, end: { line: 5 } },
      },
      {
        name: "fn2",
        selectionRange: { start: { line: 10, character: 2 } },
        range: { start: { line: 9 }, end: { line: 15 } },
      },
    ];
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{}, {}] as any);
    vi.mocked(flattenFunctionSymbols).mockReturnValue(syms as any);

    const provider = new VsCodeSymbolProvider();
    const result = await provider.getFunctionSymbols("file:///src/a.ts");

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("fn1");
    expect(result[1].name).toBe("fn2");
  });

  it("returns empty array when executeCommand throws", async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error("no provider"));

    const provider = new VsCodeSymbolProvider();
    const result = await provider.getFunctionSymbols("file:///src/a.ts");

    expect(result).toEqual([]);
  });

  it("returns empty array when executeCommand returns undefined", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

    const provider = new VsCodeSymbolProvider();
    const result = await provider.getFunctionSymbols("file:///src/a.ts");

    expect(result).toEqual([]);
  });

  it("returns empty array when executeCommand returns empty array", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([] as any);

    const provider = new VsCodeSymbolProvider();
    const result = await provider.getFunctionSymbols("file:///src/a.ts");

    expect(result).toEqual([]);
  });

  it("calls executeCommand with 'vscode.executeDocumentSymbolProvider' and parsed URI", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

    const provider = new VsCodeSymbolProvider();
    await provider.getFunctionSymbols("file:///src/a.ts");

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "vscode.executeDocumentSymbolProvider",
      expect.objectContaining({ scheme: "file" }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// VsCodeCallGraphProvider
// ═════════════════════════════════════════════════════════════════════
describe("VsCodeCallGraphProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes token, maxFiles, rootUri, and excludeTests to collectCallEdgesFromWorkspace", async () => {
    const token = fakeToken();
    const edges = [{ caller: "a", callee: "b" }];
    vi.mocked(collectCallEdgesFromWorkspace).mockResolvedValue(edges);

    const provider = new VsCodeCallGraphProvider(token, false);
    const result = await provider.collectCallEdges(50, "file:///root");

    expect(collectCallEdgesFromWorkspace).toHaveBeenCalledWith({
      token,
      maxFiles: 50,
      rootUri: "file:///root",
      excludeTests: false,
    });
    expect(result).toEqual(edges);
  });

  it("defaults excludeTests to true", async () => {
    const token = fakeToken();
    vi.mocked(collectCallEdgesFromWorkspace).mockResolvedValue([]);

    const provider = new VsCodeCallGraphProvider(token);
    await provider.collectCallEdges(10);

    expect(collectCallEdgesFromWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ excludeTests: true }),
    );
  });

  it("passes undefined rootUri when not provided", async () => {
    const token = fakeToken();
    vi.mocked(collectCallEdgesFromWorkspace).mockResolvedValue([]);

    const provider = new VsCodeCallGraphProvider(token);
    await provider.collectCallEdges(10);

    expect(collectCallEdgesFromWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ rootUri: undefined }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// VsCodeCoverageProvider
// ═════════════════════════════════════════════════════════════════════
describe("VsCodeCoverageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates loadCoverage to loadLcovIntoStore with store, glob, and token", async () => {
    const store = { get: vi.fn(), clear: vi.fn(), ingestStatementCovers: vi.fn() };
    const token = fakeToken();

    const provider = new VsCodeCoverageProvider(store as any, "**/coverage/lcov.info", token);
    await provider.loadCoverage();

    expect(loadLcovIntoStore).toHaveBeenCalledWith(store, "**/coverage/lcov.info", token);
  });

  it("delegates getStatements to store.get() with the URI", () => {
    const stmts = [{ startLine: 0, endLine: 0, executed: true }];
    const store = { get: vi.fn().mockReturnValue(stmts), clear: vi.fn(), ingestStatementCovers: vi.fn() };
    const token = fakeToken();

    const provider = new VsCodeCoverageProvider(store as any, "glob", token);
    const result = provider.getStatements("file:///a.ts");

    expect(store.get).toHaveBeenCalledWith("file:///a.ts");
    expect(result).toEqual(stmts);
  });

  it("returns undefined from getStatements when store has no data for URI", () => {
    const store = { get: vi.fn().mockReturnValue(undefined), clear: vi.fn(), ingestStatementCovers: vi.fn() };
    const token = fakeToken();

    const provider = new VsCodeCoverageProvider(store as any, "glob", token);
    const result = provider.getStatements("file:///unknown.ts");

    expect(result).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════
// EslintCcProvider
// ═════════════════════════════════════════════════════════════════════
describe("EslintCcProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns byLine from eslintCcForFile and empty byName for file:// URI", async () => {
    const ccMap = new Map([[10, 3], [20, 5]]);
    vi.mocked(eslintCcForFile).mockResolvedValue(ccMap);

    const provider = new EslintCcProvider("/usr/bin/eslint");
    const result = await provider.computeComplexity(fakeDoc("file:///src/a.ts", "typescript"));

    expect(result.byLine).toBe(ccMap);
    expect(result.byName.size).toBe(0);
  });

  it("returns empty byLine and byName for non-file scheme URI", async () => {
    const provider = new EslintCcProvider("eslint");
    const result = await provider.computeComplexity(fakeDoc("untitled:Untitled-1", "typescript"));

    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
    expect(eslintCcForFile).not.toHaveBeenCalled();
  });

  it("passes eslintPath, fsPath, and cwd to eslintCcForFile", async () => {
    vi.mocked(eslintCcForFile).mockResolvedValue(new Map());
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
      uri: { fsPath: "/workspace" },
    } as any);

    const provider = new EslintCcProvider("my-eslint");
    await provider.computeComplexity(fakeDoc("file:///workspace/src/a.ts", "typescript"));

    expect(eslintCcForFile).toHaveBeenCalledWith(
      "typescript",
      expect.any(String),
      "/workspace",
      "my-eslint",
    );
  });

  it("passes empty string as cwd when workspace folder is unknown", async () => {
    vi.mocked(eslintCcForFile).mockResolvedValue(new Map());
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

    const provider = new EslintCcProvider("eslint");
    await provider.computeComplexity(fakeDoc("file:///src/a.ts", "typescript"));

    expect(eslintCcForFile).toHaveBeenCalledWith(
      "typescript",
      expect.any(String),
      "",
      "eslint",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// RadonCcProvider
// ═════════════════════════════════════════════════════════════════════
describe("RadonCcProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns byName from radonCcForFile and empty byLine for file:// URI", async () => {
    const radonMap = new Map([["10:foo", 4]]);
    vi.mocked(radonCcForFile).mockResolvedValue(radonMap);

    const provider = new RadonCcProvider("python3");
    const result = await provider.computeComplexity(fakeDoc("file:///src/app.py", "python"));

    expect(result.byName).toBe(radonMap);
    expect(result.byLine.size).toBe(0);
  });

  it("returns empty maps for non-file scheme URI", async () => {
    const provider = new RadonCcProvider("python");
    const result = await provider.computeComplexity(fakeDoc("untitled:Untitled-1", "python"));

    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
    expect(radonCcForFile).not.toHaveBeenCalled();
  });

  it("passes pythonPath, fsPath, and cwd to radonCcForFile", async () => {
    vi.mocked(radonCcForFile).mockResolvedValue(new Map());
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
      uri: { fsPath: "/workspace" },
    } as any);

    const provider = new RadonCcProvider("/usr/bin/python3");
    await provider.computeComplexity(fakeDoc("file:///workspace/src/app.py", "python"));

    expect(radonCcForFile).toHaveBeenCalledWith(
      "python",
      expect.any(String),
      "/workspace",
      "/usr/bin/python3",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// PmdCcProvider
// ═════════════════════════════════════════════════════════════════════
describe("PmdCcProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns byLine from pmdCcForFile and empty byName for file:// URI", async () => {
    const ccMap = new Map([[5, 8]]);
    vi.mocked(pmdCcForFile).mockResolvedValue(ccMap);

    const provider = new PmdCcProvider("pmd");
    const result = await provider.computeComplexity(fakeDoc("file:///src/Main.java", "java"));

    expect(result.byLine).toBe(ccMap);
    expect(result.byName.size).toBe(0);
  });

  it("returns empty maps for non-file scheme URI", async () => {
    const provider = new PmdCcProvider("pmd");
    const result = await provider.computeComplexity(fakeDoc("untitled:Untitled-1", "java"));

    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
    expect(pmdCcForFile).not.toHaveBeenCalled();
  });

  it("passes pmdPath, fsPath, and cwd to pmdCcForFile", async () => {
    vi.mocked(pmdCcForFile).mockResolvedValue(new Map());
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
      uri: { fsPath: "/workspace" },
    } as any);

    const provider = new PmdCcProvider("/opt/pmd/bin/pmd");
    await provider.computeComplexity(fakeDoc("file:///workspace/src/Main.java", "java"));

    expect(pmdCcForFile).toHaveBeenCalledWith(
      "java",
      expect.any(String),
      "/workspace",
      "/opt/pmd/bin/pmd",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// VsCodeLogger
// ═════════════════════════════════════════════════════════════════════
describe("VsCodeLogger", () => {
  function fakeChannel() {
    return { appendLine: vi.fn() } as any;
  }

  it("formats info message as [INFO] prefix", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.info("analysis started");

    expect(channel.appendLine).toHaveBeenCalledWith("[INFO] analysis started");
  });

  it("formats warn message as [WARN] prefix", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.warn("slow query");

    expect(channel.appendLine).toHaveBeenCalledWith("[WARN] slow query");
  });

  it("formats error message as [ERROR] prefix without error object", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.error("something failed");

    expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] something failed");
  });

  it("appends Error.message after colon when err is an Error", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.error("load failed", new Error("file not found"));

    expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] load failed: file not found");
  });

  it("does not append suffix when err is a non-Error truthy value", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.error("oops", "string error");

    expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] oops");
  });

  it("does not append suffix when err is undefined", () => {
    const channel = fakeChannel();
    const logger = new VsCodeLogger(channel);

    logger.error("oops", undefined);

    expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] oops");
  });
});

// ═════════════════════════════════════════════════════════════════════
// bugmagnet session 2026-04-16
// ═════════════════════════════════════════════════════════════════════
describe("bugmagnet session 2026-04-16", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── scopedPattern edge cases (exercised indirectly) ─────────────
  describe("scopedPattern edge cases via findSourceFiles", () => {
    it("treats empty string rootUri as falsy and returns raw glob", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(10, "");

      const pattern = vi.mocked(vscode.workspace.findFiles).mock.calls[0][0];
      expect(typeof pattern).toBe("string");
    });

    it("creates RelativePattern for rootUri with encoded characters", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(10, "file:///c%3A/code/my%20project");

      const pattern = vi.mocked(vscode.workspace.findFiles).mock.calls[0][0];
      expect(typeof pattern).not.toBe("string");
      expect(pattern).toHaveProperty("pattern");
    });
  });

  // ─── findSourceFiles numeric edge cases ──────────────────────────
  describe("findSourceFiles numeric edge cases", () => {
    it("returns empty array when maxFiles is 0", async () => {
      const uri = fakeVscodeUri("file:///src/a.ts");
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([uri] as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider(false);
      const result = await provider.findSourceFiles(0);

      expect(result).toEqual([]);
    });

    it("passes limit 0 to findFiles when maxFiles is 0 and excludeTests is false", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(false);
      await provider.findSourceFiles(0);

      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0,
      );
    });

    it("passes limit 0 to findFiles when maxFiles is 0 and excludeTests is true (0*2=0)", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

      const provider = new VsCodeDocumentProvider(true);
      await provider.findSourceFiles(0);

      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0,
      );
    });

    it("returns exactly 1 file when maxFiles is 1 and many files available", async () => {
      const uris = Array.from({ length: 10 }, (_, i) =>
        fakeVscodeUri(`file:///src/f${i}.ts`)
      );
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider(true);
      const result = await provider.findSourceFiles(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe("file:///src/f0.ts");
    });
  });

  // ─── findSourceFiles: all results are test files ─────────────────
  describe("findSourceFiles when all results are test files", () => {
    it("returns empty array when every file is a test file", async () => {
      const testUris = [
        fakeVscodeUri("file:///src/a.test.ts"),
        fakeVscodeUri("file:///src/b.spec.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(testUris as any);
      vi.mocked(isTestFileUri).mockReturnValue(true);

      const provider = new VsCodeDocumentProvider(true);
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual([]);
    });
  });

  // ─── findSourceFiles: mixed schemes ──────────────────────────────
  describe("findSourceFiles mixed schemes", () => {
    it("filters out git:, vscode-userdata:, and untitled: scheme URIs", async () => {
      const uris = [
        { toString: () => "git:file.ts", scheme: "git", fsPath: "" },
        { toString: () => "vscode-userdata:settings.json", scheme: "vscode-userdata", fsPath: "" },
        { toString: () => "untitled:Untitled-1", scheme: "untitled", fsPath: "" },
        fakeVscodeUri("file:///real/src.ts"),
      ];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue(uris as any);
      vi.mocked(isTestFileUri).mockReturnValue(false);

      const provider = new VsCodeDocumentProvider(true);
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual(["file:///real/src.ts"]);
    });
  });

  // ─── openDocument: DocumentInfo.getText creates correct Range ────
  describe("openDocument getText integration", () => {
    it("creates Range with startLine, 0, endLine, and endLine text length", async () => {
      let capturedRange: any;
      const mockDoc = {
        uri: fakeUri("file:///src/a.ts"),
        languageId: "typescript",
        lineAt: (_line: number) => ({ text: "abcdef" }), // 6 chars
        getText: (range: any) => {
          capturedRange = range;
          return "mocked text";
        },
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDoc as any);

      const provider = new VsCodeDocumentProvider();
      const docInfo = await provider.openDocument("file:///src/a.ts");

      docInfo!.getText(2, 5);

      expect(capturedRange).toBeDefined();
      expect(capturedRange.startLine).toBe(2);
      expect(capturedRange.startCharacter).toBe(0);
      expect(capturedRange.endLine).toBe(5);
      expect(capturedRange.endCharacter).toBe(6); // "abcdef".length
    });
  });

  // ─── openDocument error handling edge cases ──────────────────────
  describe("openDocument error handling edge cases", () => {
    it("returns undefined when openTextDocument throws a non-Error value", async () => {
      vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue("string rejection");

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///bad.ts");

      expect(result).toBeUndefined();
    });

    it("returns undefined when openTextDocument throws null", async () => {
      vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(null);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///bad.ts");

      expect(result).toBeUndefined();
    });
  });

  // ─── VsCodeSymbolProvider: flattenFunctionSymbols returns empty ──
  describe("VsCodeSymbolProvider edge cases", () => {
    it("returns empty array when executeCommand returns symbols but flatten returns empty", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{ kind: 4 }] as any);
      vi.mocked(flattenFunctionSymbols).mockReturnValue([]);

      const provider = new VsCodeSymbolProvider();
      const result = await provider.getFunctionSymbols("file:///src/a.ts");

      expect(result).toEqual([]);
    });

    it("returns empty array when executeCommand throws a non-Error value", async () => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(42);

      const provider = new VsCodeSymbolProvider();
      const result = await provider.getFunctionSymbols("file:///src/a.ts");

      expect(result).toEqual([]);
    });

    it("maps symbols with zero-based line numbers correctly", async () => {
      const sym = {
        name: "topLevel",
        selectionRange: { start: { line: 0, character: 0 } },
        range: { start: { line: 0 }, end: { line: 0 } },
      };
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{}] as any);
      vi.mocked(flattenFunctionSymbols).mockReturnValue([sym as any]);

      const provider = new VsCodeSymbolProvider();
      const result = await provider.getFunctionSymbols("file:///src/a.ts");

      expect(result).toEqual([{
        name: "topLevel",
        selectionStartLine: 0,
        selectionStartCharacter: 0,
        bodyStartLine: 0,
        bodyEndLine: 0,
      }]);
    });
  });

  // ─── VsCodeCallGraphProvider: returns result from delegate ───────
  describe("VsCodeCallGraphProvider edge cases", () => {
    it("returns empty array when delegate returns empty array", async () => {
      vi.mocked(collectCallEdgesFromWorkspace).mockResolvedValue([]);

      const provider = new VsCodeCallGraphProvider(fakeToken());
      const result = await provider.collectCallEdges(100);

      expect(result).toEqual([]);
    });

    it("returns multiple edges from delegate", async () => {
      const edges = [
        { caller: "a#fn1", callee: "b#fn2" },
        { caller: "b#fn2", callee: "c#fn3" },
        { caller: "a#fn1", callee: "c#fn3" },
      ];
      vi.mocked(collectCallEdgesFromWorkspace).mockResolvedValue(edges);

      const provider = new VsCodeCallGraphProvider(fakeToken(), true);
      const result = await provider.collectCallEdges(50, "file:///root");

      expect(result).toEqual(edges);
      expect(result).toHaveLength(3);
    });
  });

  // ─── VsCodeCoverageProvider: multiple calls ──────────────────────
  describe("VsCodeCoverageProvider stateful operations", () => {
    it("calls loadLcovIntoStore each time loadCoverage is invoked", async () => {
      const store = { get: vi.fn(), clear: vi.fn(), ingestStatementCovers: vi.fn() };
      const token = fakeToken();
      const provider = new VsCodeCoverageProvider(store as any, "glob", token);

      await provider.loadCoverage();
      await provider.loadCoverage();

      expect(loadLcovIntoStore).toHaveBeenCalledTimes(2);
    });
  });

  // ─── CC providers: various URI schemes ───────────────────────────
  describe("CC providers with various URI schemes", () => {
    it.each([
      ["vscode-notebook-cell:", "vscode-notebook-cell:cell1"],
      ["git:", "git:file.ts"],
      ["vscode:", "vscode:settings"],
    ])("EslintCcProvider returns empty maps for %s scheme", async (_label, uri) => {
      const provider = new EslintCcProvider("eslint");
      const result = await provider.computeComplexity(fakeDoc(uri, "typescript"));

      expect(result.byLine.size).toBe(0);
      expect(result.byName.size).toBe(0);
    });

    it.each([
      ["vscode-notebook-cell:", "vscode-notebook-cell:cell1"],
      ["git:", "git:file.py"],
    ])("RadonCcProvider returns empty maps for %s scheme", async (_label, uri) => {
      const provider = new RadonCcProvider("python");
      const result = await provider.computeComplexity(fakeDoc(uri, "python"));

      expect(result.byLine.size).toBe(0);
      expect(result.byName.size).toBe(0);
    });

    it.each([
      ["vscode-notebook-cell:", "vscode-notebook-cell:cell1"],
      ["git:", "git:Main.java"],
    ])("PmdCcProvider returns empty maps for %s scheme", async (_label, uri) => {
      const provider = new PmdCcProvider("pmd");
      const result = await provider.computeComplexity(fakeDoc(uri, "java"));

      expect(result.byLine.size).toBe(0);
      expect(result.byName.size).toBe(0);
    });
  });

  // ─── CC providers: pass correct languageId to delegates ──────────
  describe("CC providers pass document languageId to underlying tool", () => {
    it("EslintCcProvider passes javascriptreact languageId", async () => {
      vi.mocked(eslintCcForFile).mockResolvedValue(new Map());
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

      const provider = new EslintCcProvider("eslint");
      await provider.computeComplexity(fakeDoc("file:///src/App.tsx", "javascriptreact"));

      expect(eslintCcForFile).toHaveBeenCalledWith(
        "javascriptreact",
        expect.any(String),
        "",
        "eslint",
      );
    });

    it("RadonCcProvider passes python languageId", async () => {
      vi.mocked(radonCcForFile).mockResolvedValue(new Map());
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

      const provider = new RadonCcProvider("python3");
      await provider.computeComplexity(fakeDoc("file:///src/main.py", "python"));

      expect(radonCcForFile).toHaveBeenCalledWith(
        "python",
        expect.any(String),
        "",
        "python3",
      );
    });

    it("PmdCcProvider passes java languageId", async () => {
      vi.mocked(pmdCcForFile).mockResolvedValue(new Map());
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

      const provider = new PmdCcProvider("pmd");
      await provider.computeComplexity(fakeDoc("file:///src/Main.java", "java"));

      expect(pmdCcForFile).toHaveBeenCalledWith(
        "java",
        expect.any(String),
        "",
        "pmd",
      );
    });
  });

  // ─── VsCodeLogger edge cases ─────────────────────────────────────
  describe("VsCodeLogger edge cases", () => {
    function fakeChannel() {
      return { appendLine: vi.fn() } as any;
    }

    it("handles empty string message", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.info("");

      expect(channel.appendLine).toHaveBeenCalledWith("[INFO] ");
    });

    it("handles message with special characters", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.info("file:///c%3A/code/src with [brackets] & <angles>");

      expect(channel.appendLine).toHaveBeenCalledWith(
        "[INFO] file:///c%3A/code/src with [brackets] & <angles>"
      );
    });

    it("handles Error with empty message", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.error("op failed", new Error(""));

      expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] op failed: ");
    });

    it("does not append suffix when err is 0 (falsy non-Error)", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.error("op failed", 0);

      expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] op failed");
    });

    it("does not append suffix when err is an object without message property", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.error("op failed", { code: 404 });

      expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] op failed");
    });

    it("appends suffix for Error subclass", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.error("op failed", new TypeError("bad type"));

      expect(channel.appendLine).toHaveBeenCalledWith("[ERROR] op failed: bad type");
    });

    it("logs multiple messages in sequence", () => {
      const channel = fakeChannel();
      const logger = new VsCodeLogger(channel);

      logger.info("step 1");
      logger.warn("step 2");
      logger.error("step 3");

      expect(channel.appendLine).toHaveBeenCalledTimes(3);
      expect(channel.appendLine).toHaveBeenNthCalledWith(1, "[INFO] step 1");
      expect(channel.appendLine).toHaveBeenNthCalledWith(2, "[WARN] step 2");
      expect(channel.appendLine).toHaveBeenNthCalledWith(3, "[ERROR] step 3");
    });
  });

  // ─── Violated domain constraints ─────────────────────────────────
  describe("violated domain constraints", () => {
    it("findSourceFiles returns empty when findFiles returns undefined-like empty", async () => {
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([] as any);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.findSourceFiles(10);

      expect(result).toEqual([]);
    });

    it("openDocument wraps URI from doc.uri.toString(), not the input string", async () => {
      // If VS Code normalizes the URI, the returned DocumentInfo.uri should reflect that
      const normalizedUri = "file:///src/normalized.ts";
      const mockDoc = {
        uri: { toString: () => normalizedUri, scheme: "file", fsPath: "" },
        languageId: "javascript",
        lineAt: () => ({ text: "" }),
        getText: () => "",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDoc as any);

      const provider = new VsCodeDocumentProvider();
      const result = await provider.openDocument("file:///src/NORMALIZED.ts");

      expect(result!.uri).toBe(normalizedUri);
    });

    it("getStatements passes URI string as-is to store (no normalization)", () => {
      const store = { get: vi.fn().mockReturnValue(undefined), clear: vi.fn(), ingestStatementCovers: vi.fn() };
      const token = fakeToken();

      const provider = new VsCodeCoverageProvider(store as any, "glob", token);
      provider.getStatements("file:///C%3A/Code/SRC/a.ts");

      expect(store.get).toHaveBeenCalledWith("file:///C%3A/Code/SRC/a.ts");
    });
  });
});
