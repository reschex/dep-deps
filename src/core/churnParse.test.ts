import { describe, it, expect } from "vitest";
import { parseGitLogToChurnCounts } from "./churnParse";

describe("parseGitLogToChurnCounts", () => {
  it("returns empty map for empty output", () => {
    expect(parseGitLogToChurnCounts("")).toEqual(new Map());
  });

  it("counts a single file appearing once", () => {
    const output = "\nsrc/foo.ts\n";
    expect(parseGitLogToChurnCounts(output)).toEqual(new Map([["src/foo.ts", 1]]));
  });

  it("counts a file appearing in multiple commits", () => {
    const output = "\nsrc/foo.ts\n\nsrc/foo.ts\nsrc/bar.ts\n";
    const result = parseGitLogToChurnCounts(output);
    expect(result.get("src/foo.ts")).toBe(2);
    expect(result.get("src/bar.ts")).toBe(1);
  });

  it("ignores blank lines between commits", () => {
    const output = "\n\nsrc/a.ts\n\n\nsrc/b.ts\n\n";
    const result = parseGitLogToChurnCounts(output);
    expect(result.size).toBe(2);
    expect(result.get("src/a.ts")).toBe(1);
    expect(result.get("src/b.ts")).toBe(1);
  });

  it("returns empty map for output containing only blank lines", () => {
    expect(parseGitLogToChurnCounts("\n\n\n")).toEqual(new Map());
  });

  it("handles CRLF line endings from Windows git output", () => {
    const output = "\r\nsrc/foo.ts\r\n\r\nsrc/foo.ts\r\nsrc/bar.ts\r\n";
    const result = parseGitLogToChurnCounts(output);
    expect(result.get("src/foo.ts")).toBe(2);
    expect(result.get("src/bar.ts")).toBe(1);
  });
});
