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
    private readonly _str: string;

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
        const path = str.replace("file:///", "").replaceAll(/%3A/gi, ":");
        fsPath = path.replaceAll("/", "\\");
      }
      return new Uri(scheme, fsPath, str);
    }

    static file(path: string): Uri {
      const normalized = path.replaceAll("\\", "/");
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

import * as vscode from "vscode";
import { loadJacocoIntoStore } from "./loadJacocoIntoStore";
import { CoverageStore } from "../core/coverageStore";

// ── helpers ──────────────────────────────────────────────────────────
function fakeFolder(uriStr: string, name = "root"): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.parse(uriStr), name, index: 0 } as any;
}

function fakeToken(cancelled = false): vscode.CancellationToken {
  return { isCancellationRequested: cancelled } as any;
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function jacocoXml(
  packages: Array<{
    name: string;
    sourcefiles: Array<{
      name: string;
      lines: Array<{ nr: number; mi: number; ci: number }>;
    }>;
  }>
): string {
  const pkgs = packages
    .map(
      (pkg) =>
        `<package name="${pkg.name}">` +
        pkg.sourcefiles
          .map(
            (sf) =>
              `<sourcefile name="${sf.name}">` +
              sf.lines
                .map((l) => `<line nr="${l.nr}" mi="${l.mi}" ci="${l.ci}" mb="0" cb="0"/>`)
                .join("") +
              `</sourcefile>`
          )
          .join("") +
        `</package>`
    )
    .join("");
  return `<?xml version="1.0"?><report name="test">${pkgs}</report>`;
}

// ═════════════════════════════════════════════════════════════════════
// loadJacocoIntoStore
// ═════════════════════════════════════════════════════════════════════
describe("loadJacocoIntoStore", () => {
  beforeEach(() => {
    mockWorkspaceFolders.length = 0;
    mockFindFiles.mockReset().mockResolvedValue([]);
    mockReadFile.mockReset().mockResolvedValue(new Uint8Array());
  });

  it("does nothing when no workspace folders exist", async () => {
    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());
    expect(mockFindFiles).not.toHaveBeenCalled();
  });

  it("finds jacoco XML files matching the glob pattern", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    expect(mockFindFiles).toHaveBeenCalledTimes(1);
  });

  it("parses JaCoCo XML and ingests line coverage into store", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);

    const jacocoFile = vscode.Uri.parse("file:///workspace/target/site/jacoco/jacoco.xml");
    mockFindFiles.mockImplementation(async (pattern: any) => {
      // First call: find jacoco.xml files
      if (typeof pattern === "object" && pattern.pattern === "**/jacoco.xml") {
        return [jacocoFile];
      }
      // Subsequent calls: resolve source file paths
      // e.g. **/com/example/Foo.java → find the actual file
      const srcFile = vscode.Uri.parse("file:///workspace/src/main/java/com/example/Foo.java");
      return [srcFile];
    });

    const xml = jacocoXml([
      {
        name: "com/example",
        sourcefiles: [
          {
            name: "Foo.java",
            lines: [
              { nr: 10, mi: 0, ci: 3 },
              { nr: 11, mi: 2, ci: 0 },
            ],
          },
        ],
      },
    ]);
    mockReadFile.mockResolvedValue(encode(xml));

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    const stmts = store.get("file:///workspace/src/main/java/com/example/Foo.java");
    expect(stmts).toBeDefined();
    expect(stmts).toHaveLength(2);
    expect(stmts![0]).toEqual({ startLine: 9, endLine: 9, executed: true });
    expect(stmts![1]).toEqual({ startLine: 10, endLine: 10, executed: false });
  });

  it("skips source files not found in workspace", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);

    const jacocoFile = vscode.Uri.parse("file:///workspace/target/site/jacoco/jacoco.xml");
    mockFindFiles.mockImplementation(async (pattern: any) => {
      if (typeof pattern === "object" && pattern.pattern === "**/jacoco.xml") {
        return [jacocoFile];
      }
      // Source file lookup returns empty — file not in workspace
      return [];
    });

    const xml = jacocoXml([
      {
        name: "com/missing",
        sourcefiles: [
          {
            name: "Gone.java",
            lines: [{ nr: 1, mi: 0, ci: 1 }],
          },
        ],
      },
    ]);
    mockReadFile.mockResolvedValue(encode(xml));

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    // No entries because the source file could not be resolved
    expect(store.get("file:///anything")).toBeUndefined();
  });

  it("does not clear existing store data (additive loading)", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    mockFindFiles.mockResolvedValue([]);

    const store = new CoverageStore();
    store.ingestStatementCovers("file:///existing.ts", [
      { startLine: 0, endLine: 0, executed: true },
    ]);

    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    // Existing data must survive
    expect(store.get("file:///existing.ts")).toBeDefined();
  });

  it("stops when cancellation is requested", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    const token = { isCancellationRequested: true } as any;

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", token);

    expect(mockFindFiles).not.toHaveBeenCalled();
  });

  it("merges coverage when two JaCoCo files report the same source file", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);

    const jacocoFile1 = vscode.Uri.parse("file:///workspace/module-a/target/jacoco.xml");
    const jacocoFile2 = vscode.Uri.parse("file:///workspace/module-b/target/jacoco.xml");
    const srcFile = vscode.Uri.parse("file:///workspace/src/main/java/com/example/Shared.java");

    mockFindFiles.mockImplementation(async (pattern: any) => {
      if (typeof pattern === "object" && pattern.pattern === "**/jacoco.xml") {
        return [jacocoFile1, jacocoFile2];
      }
      return [srcFile];
    });

    const xml1 = jacocoXml([{
      name: "com/example",
      sourcefiles: [{
        name: "Shared.java",
        lines: [{ nr: 1, mi: 0, ci: 1 }],
      }],
    }]);
    const xml2 = jacocoXml([{
      name: "com/example",
      sourcefiles: [{
        name: "Shared.java",
        lines: [{ nr: 5, mi: 0, ci: 2 }],
      }],
    }]);
    mockReadFile
      .mockResolvedValueOnce(encode(xml1))
      .mockResolvedValueOnce(encode(xml2));

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    const stmts = store.get("file:///workspace/src/main/java/com/example/Shared.java");
    expect(stmts).toBeDefined();
    expect(stmts).toHaveLength(2);
    expect(stmts![0]).toEqual({ startLine: 0, endLine: 0, executed: true });
    expect(stmts![1]).toEqual({ startLine: 4, endLine: 4, executed: true });
  });

  it("logs a debug message when source key resolves to multiple files", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const jacocoFile = vscode.Uri.parse("file:///workspace/target/jacoco.xml");
    const srcMain = vscode.Uri.parse("file:///workspace/src/main/java/com/example/Foo.java");
    const srcTest = vscode.Uri.parse("file:///workspace/src/test/java/com/example/Foo.java");

    mockFindFiles.mockImplementation(async (pattern: any) => {
      if (typeof pattern === "object" && pattern.pattern === "**/jacoco.xml") {
        return [jacocoFile];
      }
      // Ambiguous match: two files for same JaCoCo key
      return [srcMain, srcTest];
    });

    const xml = jacocoXml([{
      name: "com/example",
      sourcefiles: [{
        name: "Foo.java",
        lines: [{ nr: 1, mi: 0, ci: 1 }],
      }],
    }]);
    mockReadFile.mockResolvedValue(encode(xml));

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", fakeToken());

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ambiguous JaCoCo source"),
    );
    // Should still ingest using the first match
    const stmts = store.get("file:///workspace/src/main/java/com/example/Foo.java");
    expect(stmts).toBeDefined();

    debugSpy.mockRestore();
  });

  it("stops processing files mid-folder when cancellation is triggered", async () => {
    const folder = fakeFolder("file:///workspace");
    mockWorkspaceFolders.push(folder);

    const f1 = vscode.Uri.parse("file:///workspace/mod1/jacoco.xml");
    const f2 = vscode.Uri.parse("file:///workspace/mod2/jacoco.xml");

    mockFindFiles.mockImplementation(async (pattern: any) => {
      if (typeof pattern === "object" && pattern.pattern === "**/jacoco.xml") {
        return [f1, f2];
      }
      return [];
    });

    const xml = jacocoXml([{
      name: "com/example",
      sourcefiles: [{ name: "A.java", lines: [{ nr: 1, mi: 0, ci: 1 }] }],
    }]);

    const token = { isCancellationRequested: false } as any;
    let readCount = 0;
    mockReadFile.mockImplementation(async () => {
      readCount++;
      if (readCount >= 1) {
        token.isCancellationRequested = true;
      }
      return encode(xml);
    });

    const store = new CoverageStore();
    await loadJacocoIntoStore(store, "**/jacoco.xml", token);

    // Only the first file should be read; the second is skipped
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });
});
