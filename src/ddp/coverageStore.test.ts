import { describe, it, expect } from "vitest";
import { CoverageStore } from "../core/coverageStore";
import type { StatementCover } from "../core/coverageMap";

function stmt(line: number, executed: boolean): StatementCover {
  return { startLine: line, endLine: line, executed };
}

describe("CoverageStore", () => {
  it("returns undefined for unknown URI", () => {
    const store = new CoverageStore();
    expect(store.get("file:///unknown.ts")).toBeUndefined();
  });

  it("stores and retrieves statement covers by URI string", () => {
    const store = new CoverageStore();
    const stmts = [stmt(0, true), stmt(1, false)];
    store.ingestStatementCovers("file:///a.ts", stmts);

    const result = store.get("file:///a.ts");
    expect(result).toEqual(stmts);
  });

  it("returns a defensive copy (not the same array reference)", () => {
    const store = new CoverageStore();
    const stmts = [stmt(0, true)];
    store.ingestStatementCovers("file:///a.ts", stmts);

    const result = store.get("file:///a.ts")!;
    expect(result).toEqual(stmts);
    expect(result).not.toBe(stmts);
  });

  it("overwrites previous data for the same URI", () => {
    const store = new CoverageStore();
    store.ingestStatementCovers("file:///a.ts", [stmt(0, false)]);
    store.ingestStatementCovers("file:///a.ts", [stmt(5, true)]);

    const result = store.get("file:///a.ts")!;
    expect(result).toEqual([stmt(5, true)]);
  });

  it("clear removes all data", () => {
    const store = new CoverageStore();
    store.ingestStatementCovers("file:///a.ts", [stmt(0, true)]);
    store.ingestStatementCovers("file:///b.ts", [stmt(1, false)]);

    store.clear();

    expect(store.get("file:///a.ts")).toBeUndefined();
    expect(store.get("file:///b.ts")).toBeUndefined();
  });

  it("handles multiple files independently", () => {
    const store = new CoverageStore();
    store.ingestStatementCovers("file:///a.ts", [stmt(0, true)]);
    store.ingestStatementCovers("file:///b.ts", [stmt(1, false)]);

    expect(store.get("file:///a.ts")).toEqual([stmt(0, true)]);
    expect(store.get("file:///b.ts")).toEqual([stmt(1, false)]);
  });

  // The case-insensitive fallback only runs on Windows (process.platform === "win32").
  // On CI / non-Windows, the second assertion may not hold, so we test conditionally.
  it("case-insensitive fallback on Windows", () => {
    const store = new CoverageStore();
    store.ingestStatementCovers("file:///C%3A/code/a.ts", [stmt(0, true)]);

    if (process.platform === "win32") {
      const result = store.get("file:///c%3a/code/a.ts");
      expect(result).toEqual([stmt(0, true)]);
    } else {
      // On non-Windows, case-insensitive fallback should not apply
      expect(store.get("file:///c%3a/code/a.ts")).toBeUndefined();
    }
  });
});
