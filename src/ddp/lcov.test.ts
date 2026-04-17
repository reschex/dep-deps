import { describe, it, expect, vi } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
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
        fsPath = path.replaceAll('/', "\\");
      }
      return new Uri(scheme, fsPath, str);
    }

    static file(path: string): Uri {
      const normalized = path.replaceAll('\\', "/");
      return new Uri("file", path, `file:///${normalized}`);
    }

    static joinPath(base: Uri, ...segments: string[]): Uri {
      const joined = segments.join("/");
      const baseStr = base.toString().replace(/\/+$/, "");
      const fullStr = `${baseStr}/${joined}`;
      return Uri.parse(fullStr);
    }
  }

  return { Uri };
});

import * as vscode from "vscode";
import { normalizeLcovPathToUri } from "./lcov";

// ── helpers ──────────────────────────────────────────────────────────
function workspace(uriStr = "file:///workspace"): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.parse(uriStr), name: "root", index: 0 } as any;
}

// ═════════════════════════════════════════════════════════════════════
// normalizeLcovPathToUri
// ═════════════════════════════════════════════════════════════════════
describe("normalizeLcovPathToUri", () => {
  const ws = workspace();

  // ── High Priority ──────────────────────────────────────────────────

  it("returns Uri.file for Unix absolute path", () => {
    const result = normalizeLcovPathToUri(ws, "/home/user/file.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:////home/user/file.ts");
  });

  it("returns Uri.file for Windows absolute path with backslash", () => {
    const result = normalizeLcovPathToUri(ws, String.raw`C:\src\file.ts`);

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///C:/src/file.ts");
  });

  it("returns joined Uri for relative path", () => {
    const result = normalizeLcovPathToUri(ws, "src/file.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/src/file.ts");
  });

  it("returns undefined when Uri.file throws for absolute path", () => {
    const origFile = vscode.Uri.file;
    vscode.Uri.file = () => { throw new Error("bad path"); };

    const result = normalizeLcovPathToUri(ws, "/bad\0path");

    vscode.Uri.file = origFile;
    expect(result).toBeUndefined();
  });

  it("trims leading and trailing whitespace from lcovPath", () => {
    const result = normalizeLcovPathToUri(ws, "  src/file.ts  ");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/src/file.ts");
  });

  // ── Medium Priority ────────────────────────────────────────────────

  it("normalizes backslashes to forward slashes for relative paths", () => {
    const result = normalizeLcovPathToUri(ws, String.raw`src\dir\file.ts`);

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/src/dir/file.ts");
  });

  it("returns Uri.file for Windows absolute path with forward slashes", () => {
    const result = normalizeLcovPathToUri(ws, "C:/src/file.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///C:/src/file.ts");
  });

  it("returns Uri.file for lowercase drive letter", () => {
    const result = normalizeLcovPathToUri(ws, String.raw`c:\src\file.ts`);

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///c:/src/file.ts");
  });

  it("returns undefined for empty string", () => {
    const result = normalizeLcovPathToUri(ws, "");

    expect(result).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    const result = normalizeLcovPathToUri(ws, "   ");

    expect(result).toBeUndefined();
  });

  // ── Low Priority ───────────────────────────────────────────────────

  it("normalizes mixed separators in relative paths", () => {
    const result = normalizeLcovPathToUri(ws, String.raw`src\dir/file.ts`);

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/src/dir/file.ts");
  });

  it("returns joined Uri for dot-relative path", () => {
    const result = normalizeLcovPathToUri(ws, "./src/file.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/./src/file.ts");
  });

  it("returns joined Uri for parent-relative path", () => {
    const result = normalizeLcovPathToUri(ws, "../other/file.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/../other/file.ts");
  });

  it("returns Uri for very long relative path", () => {
    const segments = Array.from({ length: 50 }, (_, i) => `dir${i}`);
    const longPath = segments.join("/") + "/file.ts";

    const result = normalizeLcovPathToUri(ws, longPath);

    expect(result).toBeDefined();
    expect(result!.toString()).toContain("dir49/file.ts");
  });

  it("returns Uri for path with unicode characters", () => {
    const result = normalizeLcovPathToUri(ws, "src/módule/café.ts");

    expect(result).toBeDefined();
    expect(result!.toString()).toBe("file:///workspace/src/módule/café.ts");
  });

  // ═══════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═══════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    const ws = workspace();

    // ── String edge cases ──────────────────────────────────────────────

    it("returns Uri.file for path with only a Unix root slash", () => {
      const result = normalizeLcovPathToUri(ws, "/");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:////");
    });

    it("returns Uri for single-character relative filename", () => {
      const result = normalizeLcovPathToUri(ws, "a");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/a");
    });

    it("returns Uri.file for path with trailing whitespace on absolute path", () => {
      const result = normalizeLcovPathToUri(ws, "  /home/user/file.ts  ");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:////home/user/file.ts");
    });

    it("returns Uri for relative path with spaces in directory names", () => {
      const result = normalizeLcovPathToUri(ws, "my dir/my file.ts");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/my dir/my file.ts");
    });

    // ── File path edge cases ───────────────────────────────────────────

    it("returns joined Uri for path starting with dot-dot backslash", () => {
      const result = normalizeLcovPathToUri(ws, String.raw`..\parent\file.ts`);

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/../parent/file.ts");
    });

    it("returns joined Uri for path with consecutive slashes", () => {
      const result = normalizeLcovPathToUri(ws, "src//dir///file.ts");

      expect(result).toBeDefined();
      expect(result!.toString()).toContain("src//dir///file.ts");
    });

    it("returns joined Uri for path with trailing slash", () => {
      const result = normalizeLcovPathToUri(ws, "src/dir/");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/src/dir/");
    });

    // ── Drive letter edge cases ────────────────────────────────────────

    it("returns Uri.file for drive letter with forward slash", () => {
      const result = normalizeLcovPathToUri(ws, "D:/projects/file.ts");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///D:/projects/file.ts");
    });

    it("treats drive-letter-like string without separator as relative", () => {
      // "C:" alone doesn't match /^[a-zA-Z]:[\\/]/ — no separator after colon
      const result = normalizeLcovPathToUri(ws, "C:");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/C:");
    });

    it("treats string starting with digit and colon as relative", () => {
      // "1:\\file" — digit is not [a-zA-Z]
      const result = normalizeLcovPathToUri(ws, String.raw`1:\file`);

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/1:/file");
    });

    // ── Error propagation ──────────────────────────────────────────────

    it("returns undefined when Uri.file throws for Windows absolute path", () => {
      const origFile = vscode.Uri.file;
      vscode.Uri.file = () => { throw new Error("bad"); };

      const result = normalizeLcovPathToUri(ws, String.raw`C:\bad\path`);

      vscode.Uri.file = origFile;
      expect(result).toBeUndefined();
    });

    // ── Workspace URI variations ───────────────────────────────────────

    it("joins relative path to workspace with trailing slash in URI", () => {
      const wsTrailing = workspace("file:///workspace/");

      const result = normalizeLcovPathToUri(wsTrailing, "src/file.ts");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///workspace/src/file.ts");
    });

    it("joins relative path to workspace with nested URI", () => {
      const wsNested = workspace("file:///home/user/project");

      const result = normalizeLcovPathToUri(wsNested, "src/file.ts");

      expect(result).toBeDefined();
      expect(result!.toString()).toBe("file:///home/user/project/src/file.ts");
    });
  });
});
