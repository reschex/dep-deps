import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
const { mockWorkspaceFolders, mockFindFiles, mockReadFile } = vi.hoisted(() => {
  const mockWorkspaceFolders: any[] = [];
  const mockFindFiles = vi.fn(async () => [] as any[]);
  const mockReadFile = vi.fn(async () => new Uint8Array());
  return { mockWorkspaceFolders, mockFindFiles, mockReadFile };
});

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
      let fsPath = "";
      if (scheme === "file") {
        const path = str.replace("file:///", "").replace(/%3A/gi, ":");
        fsPath = path.replace(/\//g, "\\");
      }
      return new Uri(scheme, fsPath, str);
    }

    static file(path: string): Uri {
      const normalized = path.replace(/\\/g, "/");
      return new Uri("file", path, `file:///${normalized}`);
    }

    static joinPath(base: Uri, ...segments: string[]): Uri {
      const joined = segments.join("/");
      const baseStr = base.toString().replace(/\/+$/, "");
      const fullStr = `${baseStr}/${joined}`;
      return Uri.parse(fullStr);
    }
  }

  class RelativePattern {
    constructor(
      public baseUri: unknown,
      public pattern: string,
    ) {}
  }

  return {
    Uri,
    RelativePattern,
    workspace: {
      get workspaceFolders() {
        return mockWorkspaceFolders.length ? mockWorkspaceFolders : undefined;
      },
      findFiles: mockFindFiles,
      fs: { readFile: mockReadFile },
    },
  };
});

// ── dependency mocks ─────────────────────────────────────────────────
vi.mock("./lcov", () => ({
  normalizeLcovPathToUri: vi.fn(),
}));

import * as vscode from "vscode";
import { loadLcovIntoStore, CoverageStore } from "./coverageStore";
import { normalizeLcovPathToUri } from "./lcov";

// ── helpers ──────────────────────────────────────────────────────────
function fakeFolder(uriStr: string, name = "root"): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.parse(uriStr), name, index: 0 } as any;
}

function fakeToken(cancelled = false): vscode.CancellationToken {
  return { isCancellationRequested: cancelled } as any;
}

/** Build a minimal valid LCOV string. */
function lcov(entries: Array<{ sf: string; lines: Array<[number, number]> }>): string {
  return entries
    .map(
      (e) =>
        `SF:${e.sf}\n` +
        e.lines.map(([line, hits]) => `DA:${line},${hits}`).join("\n") +
        "\nend_of_record",
    )
    .join("\n");
}

function encodeLcov(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ═════════════════════════════════════════════════════════════════════
// loadLcovIntoStore
// ═════════════════════════════════════════════════════════════════════
describe("loadLcovIntoStore", () => {
  beforeEach(() => {
    mockWorkspaceFolders.length = 0;
    mockFindFiles.mockReset().mockResolvedValue([]);
    mockReadFile.mockReset().mockResolvedValue(new Uint8Array());
    vi.mocked(normalizeLcovPathToUri).mockReset();
  });

  // ─── High Priority: core functionality & branches ──────────────────

  it("clears store before loading", async () => {
    const store = new CoverageStore();
    store.ingestStatementCovers("file:///old.ts", [{ startLine: 0, endLine: 0, executed: true }]);

    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(store.get("file:///old.ts")).toBeUndefined();
  });

  it("returns immediately when no workspace folders exist", async () => {
    // mockWorkspaceFolders is empty => workspace.workspaceFolders is undefined
    const store = new CoverageStore();

    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(mockFindFiles).not.toHaveBeenCalled();
  });

  it("returns immediately when workspace folders array is empty", async () => {
    // workspaceFolders getter returns undefined when length is 0
    const store = new CoverageStore();

    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(mockFindFiles).not.toHaveBeenCalled();
  });

  it("loads LCOV file and ingests parsed data into store", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    const lcovFile = vscode.Uri.parse("file:///workspace/coverage/lcov.info");
    mockFindFiles.mockResolvedValue([lcovFile]);
    const lcovText = lcov([{ sf: "/src/a.ts", lines: [[1, 5], [2, 0]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    const result = store.get("file:////src/a.ts");
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ startLine: 0, endLine: 0, executed: true });
    expect(result![1]).toEqual({ startLine: 1, endLine: 1, executed: false });
  });

  it("merges data from multiple LCOV files in one folder", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    const file1 = vscode.Uri.parse("file:///workspace/cov1/lcov.info");
    const file2 = vscode.Uri.parse("file:///workspace/cov2/lcov.info");
    mockFindFiles.mockResolvedValue([file1, file2]);
    const lcov1 = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);
    const lcov2 = lcov([{ sf: "/src/a.ts", lines: [[3, 2]] }]);
    mockReadFile
      .mockResolvedValueOnce(encodeLcov(lcov1))
      .mockResolvedValueOnce(encodeLcov(lcov2));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    const result = store.get("file:////src/a.ts");
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ startLine: 0, endLine: 0, executed: true });
    expect(result![1]).toEqual({ startLine: 2, endLine: 2, executed: true });
  });

  it("merges data from multiple workspace folders", async () => {
    const folder1 = fakeFolder("file:///ws1", "ws1");
    const folder2 = fakeFolder("file:///ws2", "ws2");
    mockWorkspaceFolders.push(folder1, folder2);
    const f1 = vscode.Uri.parse("file:///ws1/lcov.info");
    const f2 = vscode.Uri.parse("file:///ws2/lcov.info");
    // findFiles called per-folder; return one file each
    mockFindFiles
      .mockResolvedValueOnce([f1])
      .mockResolvedValueOnce([f2]);
    const lc1 = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);
    const lc2 = lcov([{ sf: "/src/b.ts", lines: [[2, 0]] }]);
    mockReadFile
      .mockResolvedValueOnce(encodeLcov(lc1))
      .mockResolvedValueOnce(encodeLcov(lc2));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(store.get("file:////src/a.ts")).toBeDefined();
    expect(store.get("file:////src/b.ts")).toBeDefined();
  });

  it("stops processing folders when cancellation token is triggered", async () => {
    const folder1 = fakeFolder("file:///ws1");
    const folder2 = fakeFolder("file:///ws2");
    mockWorkspaceFolders.push(folder1, folder2);
    const token = { isCancellationRequested: true } as any;

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", token);

    // Token was already cancelled => findFiles never called
    expect(mockFindFiles).not.toHaveBeenCalled();
  });

  it("stops processing files when cancellation token is triggered between files", async () => {
    const folder = fakeFolder("file:///ws");
    mockWorkspaceFolders.push(folder);
    const f1 = vscode.Uri.parse("file:///ws/cov1/lcov.info");
    const f2 = vscode.Uri.parse("file:///ws/cov2/lcov.info");
    mockFindFiles.mockResolvedValue([f1, f2]);
    const lc = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);

    let callCount = 0;
    const token = { isCancellationRequested: false } as any;
    mockReadFile.mockImplementation(async () => {
      callCount++;
      if (callCount >= 1) {
        token.isCancellationRequested = true;
      }
      return encodeLcov(lc);
    });

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", token);

    // Only one file should be read (second skipped due to token)
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  // ─── Medium Priority: resolveLcovSfToUri path resolution ───────────

  it("resolves Windows absolute path (C:\\src\\a.ts) to Uri.file", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    const lcovText = lcov([{ sf: "C:\\src\\a.ts", lines: [[1, 1]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    // Windows path C:\src\a.ts -> Uri.file("C:\\src\\a.ts") -> "file:///C:/src/a.ts"
    // then re-parsed via Uri.parse in the ingestion loop
    const result = store.get("file:///C:/src/a.ts");
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result![0].executed).toBe(true);
  });

  it("resolves Unix absolute path (/src/a.ts) to Uri.file", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    const lcovText = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    const result = store.get("file:////src/a.ts");
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
  });

  it("resolves relative path via normalizeLcovPathToUri fallback", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    const lcovText = lcov([{ sf: "src/a.ts", lines: [[1, 1]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));
    vi.mocked(normalizeLcovPathToUri).mockReturnValue(
      vscode.Uri.parse("file:///workspace/src/a.ts"),
    );

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(normalizeLcovPathToUri).toHaveBeenCalledWith(folder, "src/a.ts");
    const result = store.get("file:///workspace/src/a.ts");
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
  });

  it("skips empty SF paths without ingesting", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    // SF with just whitespace => trimmed to empty => resolveLcovSfToUri returns undefined
    const lcovText = "SF:   \nDA:1,1\nend_of_record";
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    // Nothing should be ingested — parseLcovToStatementCovers uses "   " as key
    // resolveLcovSfToUri trims it to empty => returns undefined => skipped
    // Store should have no entries
    expect(normalizeLcovPathToUri).not.toHaveBeenCalled();
  });

  it("falls back to normalizeLcovPathToUri when Uri.file throws", async () => {
    // This is hard to trigger with our mock since Uri.file doesn't throw.
    // Instead, test the relative-path fallback more explicitly — a path
    // like "src/file.ts" (no leading / or drive letter) hits the fallback.
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    const lcovText = lcov([{ sf: "lib/utils.ts", lines: [[5, 3]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));
    vi.mocked(normalizeLcovPathToUri).mockReturnValue(
      vscode.Uri.parse("file:///workspace/lib/utils.ts"),
    );

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(normalizeLcovPathToUri).toHaveBeenCalledWith(folder, "lib/utils.ts");
    expect(store.get("file:///workspace/lib/utils.ts")).toHaveLength(1);
  });

  // ─── Low Priority: edge cases ──────────────────────────────────────

  it("re-parses URI key via Uri.parse before ingesting into store", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    const lcovText = lcov([{ sf: "C:\\Code\\app.ts", lines: [[1, 1]] }]);
    mockReadFile.mockResolvedValue(encodeLcov(lcovText));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    // The resolved URI gets set in the map, then mergeLcovMaps preserves the key,
    // then Uri.parse(k).toString() is used as the final store key.
    // Our mock: Uri.file("C:\\Code\\app.ts") => "file:///C:/Code/app.ts"
    // Then Uri.parse("file:///C:/Code/app.ts").toString() => "file:///C:/Code/app.ts"
    const result = store.get("file:///C:/Code/app.ts");
    expect(result).toBeDefined();
  });

  it("returns empty store when findFiles returns no LCOV files", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([]);

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("returns empty store when LCOV file has no parseable DA records", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///workspace/lcov.info")]);
    mockReadFile.mockResolvedValue(encodeLcov("TN:test\nend_of_record\n"));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    // No SF: line => nothing parsed
    expect(mockReadFile).toHaveBeenCalledOnce();
  });

  it("merges entries for same URI across multiple files", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    const f1 = vscode.Uri.parse("file:///workspace/cov1/lcov.info");
    const f2 = vscode.Uri.parse("file:///workspace/cov2/lcov.info");
    mockFindFiles.mockResolvedValue([f1, f2]);

    // Both files have coverage for the same file
    const lc1 = lcov([{ sf: "/shared/module.ts", lines: [[1, 1]] }]);
    const lc2 = lcov([{ sf: "/shared/module.ts", lines: [[5, 0]] }]);
    mockReadFile
      .mockResolvedValueOnce(encodeLcov(lc1))
      .mockResolvedValueOnce(encodeLcov(lc2));

    const store = new CoverageStore();
    await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

    const result = store.get("file:////shared/module.ts");
    expect(result).toBeDefined();
    // mergeLcovMaps concatenates statements
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ startLine: 0, endLine: 0, executed: true });
    expect(result![1]).toEqual({ startLine: 4, endLine: 4, executed: false });
  });

  // ═════════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═════════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    // ─── error handling ──────────────────────────────────────────────
    describe("error handling", () => {
      it("propagates error when findFiles rejects", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockRejectedValue(new Error("findFiles failed"));

        const store = new CoverageStore();
        await expect(loadLcovIntoStore(store, "**/lcov.info", fakeToken()))
          .rejects.toThrow("findFiles failed");
      });

      it("propagates error when readFile rejects", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        mockReadFile.mockRejectedValue(new Error("read failed"));

        const store = new CoverageStore();
        await expect(loadLcovIntoStore(store, "**/lcov.info", fakeToken()))
          .rejects.toThrow("read failed");
      });

      it("still clears store even when findFiles rejects", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockRejectedValue(new Error("boom"));

        const store = new CoverageStore();
        store.ingestStatementCovers("file:///old.ts", [{ startLine: 0, endLine: 0, executed: true }]);

        await expect(loadLcovIntoStore(store, "**/lcov.info", fakeToken()))
          .rejects.toThrow("boom");

        // Store was cleared at the top of loadLcovIntoStore before the error
        expect(store.get("file:///old.ts")).toBeUndefined();
      });
    });

    // ─── resolveLcovSfToUri path edge cases ──────────────────────────
    describe("path resolution edge cases", () => {
      it("resolves Windows path with forward slashes (C:/src/a.ts)", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        // Forward-slash Windows path — the regex ^[A-Za-z]:/ will match after normalize
        const lcovText = lcov([{ sf: "C:/src/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // Uri.file is called with backslashes after replaceAll("/", "\\")
        const result = store.get("file:///C:/src/a.ts");
        expect(result).toBeDefined();
        expect(result![0].executed).toBe(true);
      });

      it("resolves path with leading whitespace", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([{ sf: "  /src/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // trim() removes leading space, then /src/a.ts is an absolute Unix path
        const result = store.get("file:////src/a.ts");
        expect(result).toBeDefined();
      });

      it("resolves path with trailing whitespace", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([{ sf: "/src/a.ts   ", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // trim() removes trailing spaces
        const result = store.get("file:////src/a.ts");
        expect(result).toBeDefined();
      });

      it("skips SF path that is only whitespace", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = "SF:   \t  \nDA:1,1\nend_of_record";
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        expect(normalizeLcovPathToUri).not.toHaveBeenCalled();
      });

      it("falls back to normalizeLcovPathToUri for dot-relative paths", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([{ sf: "./src/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));
        vi.mocked(normalizeLcovPathToUri).mockReturnValue(
          vscode.Uri.parse("file:///workspace/src/a.ts"),
        );

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        expect(normalizeLcovPathToUri).toHaveBeenCalledWith(folder, "./src/a.ts");
        expect(store.get("file:///workspace/src/a.ts")).toBeDefined();
      });

      it("skips entry when normalizeLcovPathToUri returns undefined for relative path", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([{ sf: "some/relative.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));
        vi.mocked(normalizeLcovPathToUri).mockReturnValue(undefined);

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // normalizeLcovPathToUri returned undefined => entry skipped
        expect(normalizeLcovPathToUri).toHaveBeenCalled();
      });

      it("resolves lowercase drive letter path (c:\\src\\a.ts)", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([{ sf: "c:\\src\\a.ts", lines: [[2, 3]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // c:\src\a.ts normalized to c:/src/a.ts, matches ^[A-Za-z]:/, then
        // Uri.file called with backslashes c:\src\a.ts => file:///c:/src/a.ts
        const result = store.get("file:///c:/src/a.ts");
        expect(result).toBeDefined();
        expect(result![0]).toEqual({ startLine: 1, endLine: 1, executed: true });
      });
    });

    // ─── complex interactions ────────────────────────────────────────
    describe("complex interactions", () => {
      it("passes pattern to RelativePattern for each folder", async () => {
        const folder1 = fakeFolder("file:///ws1", "ws1");
        const folder2 = fakeFolder("file:///ws2", "ws2");
        mockWorkspaceFolders.push(folder1, folder2);
        mockFindFiles.mockResolvedValue([]);

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "custom/**/lcov.info", fakeToken());

        expect(mockFindFiles).toHaveBeenCalledTimes(2);
        // Verify RelativePattern was constructed with correct folder and pattern
        const call1 = mockFindFiles.mock.calls[0];
        expect(call1[0]).toBeInstanceOf(vscode.RelativePattern);
        expect((call1[0] as any).pattern).toBe("custom/**/lcov.info");
        const call2 = mockFindFiles.mock.calls[1];
        expect((call2[0] as any).pattern).toBe("custom/**/lcov.info");
      });

      it("excludes node_modules in findFiles call", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([]);

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        expect(mockFindFiles).toHaveBeenCalledWith(
          expect.anything(),
          "**/node_modules/**",
          50,
        );
      });

      it("limits findFiles to 50 results per folder", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([]);

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        expect(mockFindFiles.mock.calls[0][2]).toBe(50);
      });

      it("processes multiple SF entries in single LCOV file", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = lcov([
          { sf: "/src/a.ts", lines: [[1, 1]] },
          { sf: "/src/b.ts", lines: [[2, 0]] },
          { sf: "/src/c.ts", lines: [[3, 5]] },
        ]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        expect(store.get("file:////src/a.ts")).toHaveLength(1);
        expect(store.get("file:////src/b.ts")).toHaveLength(1);
        expect(store.get("file:////src/c.ts")).toHaveLength(1);
      });

      it("handles LCOV file with many DA lines for one SF", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lines: Array<[number, number]> = Array.from({ length: 50 }, (_, i) => [i + 1, i % 2]);
        const lcovText = lcov([{ sf: "/src/big.ts", lines }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        const result = store.get("file:////src/big.ts");
        expect(result).toHaveLength(50);
        // First line: DA:1,0 => startLine:0, executed:false
        expect(result![0]).toEqual({ startLine: 0, endLine: 0, executed: false });
        // Second line: DA:2,1 => startLine:1, executed:true
        expect(result![1]).toEqual({ startLine: 1, endLine: 1, executed: true });
      });
    });

    // ─── stateful operations ─────────────────────────────────────────
    describe("stateful operations", () => {
      it("replaces store contents on second call (clears old data)", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);

        // First call loads file A
        const lc1 = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lc1));
        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());
        expect(store.get("file:////src/a.ts")).toBeDefined();

        // Second call loads file B (different file)
        const lc2 = lcov([{ sf: "/src/b.ts", lines: [[2, 0]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lc2));
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // A should be gone (cleared), B should be there
        expect(store.get("file:////src/a.ts")).toBeUndefined();
        expect(store.get("file:////src/b.ts")).toBeDefined();
      });

      it("cancellation mid-folder leaves already-processed folders intact in store", async () => {
        const folder1 = fakeFolder("file:///ws1", "ws1");
        const folder2 = fakeFolder("file:///ws2", "ws2");
        mockWorkspaceFolders.push(folder1, folder2);

        const token = { isCancellationRequested: false } as any;
        // First folder returns data, second folder will be skipped
        const f1 = vscode.Uri.parse("file:///ws1/lcov.info");
        let callNum = 0;
        mockFindFiles.mockImplementation(async () => {
          callNum++;
          if (callNum === 1) return [f1];
          return []; // shouldn't reach here
        });
        const lc1 = lcov([{ sf: "/src/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockImplementation(async () => {
          token.isCancellationRequested = true; // cancel after first read
          return encodeLcov(lc1);
        });

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", token);

        // Data from folder1 should still be merged and ingested
        expect(store.get("file:////src/a.ts")).toBeDefined();
        // findFiles should only be called once (folder2 skipped)
        expect(mockFindFiles).toHaveBeenCalledTimes(1);
      });
    });

    // ─── string edge cases ───────────────────────────────────────────
    describe("string edge cases in LCOV content", () => {
      it("handles empty LCOV file content", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        mockReadFile.mockResolvedValue(encodeLcov(""));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // Empty content => no SF lines => nothing ingested
        expect(mockReadFile).toHaveBeenCalledOnce();
      });

      it("handles LCOV with Windows line endings (CRLF)", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        const lcovText = "SF:/src/a.ts\r\nDA:1,1\r\nend_of_record\r\n";
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        const result = store.get("file:////src/a.ts");
        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result![0].executed).toBe(true);
      });

      it("handles LCOV with mixed path separators in SF", async () => {
        const folder = fakeFolder("file:///workspace");
        mockWorkspaceFolders.push(folder);
        mockFindFiles.mockResolvedValue([vscode.Uri.parse("file:///ws/lcov.info")]);
        // Mixed: backslash then forward slashes
        const lcovText = lcov([{ sf: "C:\\src/subdir/a.ts", lines: [[1, 1]] }]);
        mockReadFile.mockResolvedValue(encodeLcov(lcovText));

        const store = new CoverageStore();
        await loadLcovIntoStore(store, "**/lcov.info", fakeToken());

        // backslashes normalized to / => C:/src/subdir/a.ts matches Windows regex
        // then replaceAll("/", "\\") => C:\src\subdir\a.ts passed to Uri.file
        const result = store.get("file:///C:/src/subdir/a.ts");
        expect(result).toBeDefined();
      });
    });
  });
});
