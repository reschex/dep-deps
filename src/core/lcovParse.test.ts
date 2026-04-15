import { describe, it, expect } from "vitest";
import { parseLcovToStatementCovers, mergeLcovMaps } from "./lcovParse";

describe("parseLcovToStatementCovers", () => {
  it("parses SF and DA records with 1-based lines", () => {
    const lcov = `
SF:src/foo.ts
DA:10,1
DA:11,0
end_of_record
`;
    const m = parseLcovToStatementCovers(lcov);
    const stmts = m.get("src/foo.ts");
    expect(stmts).toBeDefined();
    expect(stmts![0]).toMatchObject({ startLine: 9, endLine: 9, executed: true });
    expect(stmts![1]).toMatchObject({ startLine: 10, endLine: 10, executed: false });
  });

  it("returns empty map for empty string", () => {
    const m = parseLcovToStatementCovers("");
    expect(m.size).toEqual(0);
  });

  it("returns empty map for whitespace-only input", () => {
    const m = parseLcovToStatementCovers("   \n\n  \t  ");
    expect(m.size).toEqual(0);
  });

  it("skips DA line with no comma", () => {
    const lcov = `SF:src/a.ts\nDA:10\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.has("src/a.ts")).toBe(false);
  });

  it("skips DA line with non-numeric line number", () => {
    const lcov = `SF:src/a.ts\nDA:abc,1\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.has("src/a.ts")).toBe(false);
  });

  it("skips DA line with non-numeric hit count", () => {
    const lcov = `SF:src/a.ts\nDA:10,xyz\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.has("src/a.ts")).toBe(false);
  });

  it("parses multiple files in one LCOV blob", () => {
    const lcov = [
      "SF:src/a.ts", "DA:1,1", "end_of_record",
      "SF:src/b.ts", "DA:5,0", "end_of_record",
    ].join("\n");
    const m = parseLcovToStatementCovers(lcov);
    expect(m.size).toEqual(2);
    expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    expect(m.get("src/b.ts")).toEqual([{ startLine: 4, endLine: 4, executed: false }]);
  });

  it("ignores DA lines before any SF block", () => {
    const lcov = `DA:1,1\nSF:src/a.ts\nDA:2,1\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.size).toEqual(1);
    expect(m.get("src/a.ts")!.length).toEqual(1);
    expect(m.get("src/a.ts")![0].startLine).toEqual(1);
  });

  it("ignores DA lines after end_of_record but before next SF", () => {
    const lcov = [
      "SF:src/a.ts", "DA:1,1", "end_of_record",
      "DA:99,1",
      "SF:src/b.ts", "DA:3,0", "end_of_record",
    ].join("\n");
    const m = parseLcovToStatementCovers(lcov);
    expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    expect(m.get("src/b.ts")).toEqual([{ startLine: 2, endLine: 2, executed: false }]);
  });

  it("handles Windows CRLF line endings", () => {
    const lcov = "SF:src/a.ts\r\nDA:1,1\r\nend_of_record\r\n";
    const m = parseLcovToStatementCovers(lcov);
    expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
  });

  it("maps line 1 to 0-based 0", () => {
    const lcov = `SF:src/a.ts\nDA:1,1\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.get("src/a.ts")![0]).toEqual({ startLine: 0, endLine: 0, executed: true });
  });

  it("handles very large line numbers", () => {
    const lcov = `SF:src/a.ts\nDA:999999,1\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.get("src/a.ts")![0]).toEqual({ startLine: 999998, endLine: 999998, executed: true });
  });

  it("sets executed false when hits is 0", () => {
    const lcov = `SF:src/a.ts\nDA:5,0\nend_of_record`;
    const stmts = parseLcovToStatementCovers(lcov).get("src/a.ts")!;
    expect(stmts[0].executed).toBe(false);
  });

  it("sets executed true when hits is greater than 1", () => {
    const lcov = `SF:src/a.ts\nDA:5,42\nend_of_record`;
    const stmts = parseLcovToStatementCovers(lcov).get("src/a.ts")!;
    expect(stmts[0].executed).toBe(true);
  });

  it("does not create map entry for SF block with no DA records", () => {
    const lcov = `SF:src/empty.ts\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    expect(m.has("src/empty.ts")).toBe(false);
  });

  it("parses DA line with extra commas after hit count", () => {
    const lcov = `SF:src/a.ts\nDA:10,1,extra\nend_of_record`;
    const m = parseLcovToStatementCovers(lcov);
    const stmts = m.get("src/a.ts")!;
    expect(stmts[0]).toEqual({ startLine: 9, endLine: 9, executed: true });
  });
});

describe("mergeLcovMaps", () => {
  it("returns empty map for empty input array", () => {
    const result = mergeLcovMaps([]);
    expect(result.size).toEqual(0);
  });

  it("returns copy of single map", () => {
    const input = new Map([["src/a.ts", [{ executed: true, startLine: 0, endLine: 0 }]]]);
    const result = mergeLcovMaps([input]);
    expect(result.get("src/a.ts")).toEqual([{ executed: true, startLine: 0, endLine: 0 }]);
  });

  it("merges maps with disjoint file keys", () => {
    const m1 = new Map([["src/a.ts", [{ executed: true, startLine: 0, endLine: 0 }]]]);
    const m2 = new Map([["src/b.ts", [{ executed: false, startLine: 1, endLine: 1 }]]]);
    const result = mergeLcovMaps([m1, m2]);
    expect(result.size).toEqual(2);
    expect(result.get("src/a.ts")).toEqual([{ executed: true, startLine: 0, endLine: 0 }]);
    expect(result.get("src/b.ts")).toEqual([{ executed: false, startLine: 1, endLine: 1 }]);
  });

  it("concatenates statements for overlapping file keys", () => {
    const s1 = { executed: true, startLine: 0, endLine: 0 };
    const s2 = { executed: false, startLine: 5, endLine: 5 };
    const m1 = new Map([["src/a.ts", [s1]]]);
    const m2 = new Map([["src/a.ts", [s2]]]);
    const result = mergeLcovMaps([m1, m2]);
    expect(result.get("src/a.ts")).toEqual([s1, s2]);
  });
});

describe("bugmagnet session 2026-04-15", () => {
  describe("parseLcovToStatementCovers – string edge cases", () => {
    it("trims whitespace from SF file path", () => {
      const lcov = "SF:  src/a.ts  \nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles SF path with spaces in name", () => {
      const lcov = "SF:src/my file.ts\nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("src/my file.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles SF path with unicode characters", () => {
      const lcov = "SF:src/módulo.ts\nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("src/módulo.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles SF with Windows backslash path", () => {
      const lcov = "SF:C:\\Users\\dev\\src\\a.ts\nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("C:\\Users\\dev\\src\\a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles SF with very long file path", () => {
      const longPath = "src/" + "a".repeat(300) + ".ts";
      const lcov = `SF:${longPath}\nDA:1,1\nend_of_record`;
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get(longPath)).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("ignores unrecognized LCOV record types", () => {
      const lcov = [
        "TN:test-name",
        "SF:src/a.ts",
        "FN:1,myFunc",
        "FNDA:5,myFunc",
        "FNF:1",
        "FNH:1",
        "DA:1,5",
        "LF:1",
        "LH:1",
        "BRDA:1,0,0,1",
        "BRF:1",
        "BRH:1",
        "end_of_record",
      ].join("\n");
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });
  });

  describe("parseLcovToStatementCovers – numeric edge cases", () => {
    it("skips DA with line number 0 (invalid 1-based)", () => {
      const lcov = "SF:src/a.ts\nDA:0,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.has("src/a.ts")).toBe(false);
    });

    it("skips DA with negative line number", () => {
      const lcov = "SF:src/a.ts\nDA:-5,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.has("src/a.ts")).toBe(false);
    });

    it("handles hit count of negative number", () => {
      // Negative hit count: hits > 0 is false
      const lcov = "SF:src/a.ts\nDA:1,-3\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/a.ts")!;
      expect(stmts[0].executed).toBe(false);
    });

    it("handles DA with floating-point line number (parseInt truncates)", () => {
      const lcov = "SF:src/a.ts\nDA:5.9,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/a.ts")!;
      // parseInt("5.9", 10) === 5
      expect(stmts[0].startLine).toEqual(4);
    });

    it("handles DA with floating-point hit count (parseInt truncates)", () => {
      const lcov = "SF:src/a.ts\nDA:1,2.7\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/a.ts")!;
      // parseInt("2.7", 10) === 2, hits > 0
      expect(stmts[0].executed).toBe(true);
    });

    it("handles many DA records for one file", () => {
      const daLines = Array.from({ length: 200 }, (_, i) => `DA:${i + 1},${i % 2}`);
      const lcov = ["SF:src/big.ts", ...daLines, "end_of_record"].join("\n");
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/big.ts")!;
      expect(stmts.length).toEqual(200);
      expect(stmts[0]).toEqual({ startLine: 0, endLine: 0, executed: false });
      expect(stmts[1]).toEqual({ startLine: 1, endLine: 1, executed: true });
      expect(stmts[199]).toEqual({ startLine: 199, endLine: 199, executed: true });
    });
  });

  describe("parseLcovToStatementCovers – state management edge cases", () => {
    it("handles two consecutive SF lines (second overwrites first)", () => {
      const lcov = [
        "SF:src/first.ts",
        "SF:src/second.ts",
        "DA:1,1",
        "end_of_record",
      ].join("\n");
      const m = parseLcovToStatementCovers(lcov);
      expect(m.has("src/first.ts")).toBe(false);
      expect(m.get("src/second.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles same file appearing in multiple SF blocks", () => {
      const lcov = [
        "SF:src/a.ts", "DA:1,1", "end_of_record",
        "SF:src/a.ts", "DA:5,0", "end_of_record",
      ].join("\n");
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/a.ts")!;
      // Both records appended to same list since map key matches
      expect(stmts.length).toEqual(2);
      expect(stmts[0]).toEqual({ startLine: 0, endLine: 0, executed: true });
      expect(stmts[1]).toEqual({ startLine: 4, endLine: 4, executed: false });
    });

    it("handles missing end_of_record (DA still parsed)", () => {
      const lcov = "SF:src/a.ts\nDA:1,1";
      const m = parseLcovToStatementCovers(lcov);
      expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("does not treat end_of_record with trailing text as record boundary", () => {
      const lcov = "SF:src/a.ts\nDA:1,1\nend_of_record extra stuff\nDA:2,0\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      // "end_of_record extra stuff" is NOT exact match, so file stays open
      const stmts = m.get("src/a.ts")!;
      expect(stmts.length).toEqual(2);
      expect(stmts[0]).toEqual({ startLine: 0, endLine: 0, executed: true });
      expect(stmts[1]).toEqual({ startLine: 1, endLine: 1, executed: false });
    });

    it("handles DA line that is exactly 'DA:' with nothing after", () => {
      const lcov = "SF:src/a.ts\nDA:\nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      // "DA:" → rest = "", indexOf(",") = -1 → skipped
      expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });

    it("handles DA line with only comma", () => {
      const lcov = "SF:src/a.ts\nDA:,\nDA:1,1\nend_of_record";
      const m = parseLcovToStatementCovers(lcov);
      // parseInt("", 10) = NaN, parseInt("", 10) = NaN → skipped
      expect(m.get("src/a.ts")).toEqual([{ startLine: 0, endLine: 0, executed: true }]);
    });
  });

  describe("parseLcovToStatementCovers – complex interactions", () => {
    it("handles mixed valid and invalid DA lines in same block", () => {
      const lcov = [
        "SF:src/a.ts",
        "DA:1,1",       // valid
        "DA:bad",        // no comma → skip
        "DA:abc,1",      // NaN line → skip
        "DA:3,xyz",      // NaN hits → skip
        "DA:5,0",        // valid
        "end_of_record",
      ].join("\n");
      const m = parseLcovToStatementCovers(lcov);
      const stmts = m.get("src/a.ts")!;
      expect(stmts.length).toEqual(2);
      expect(stmts[0]).toEqual({ startLine: 0, endLine: 0, executed: true });
      expect(stmts[1]).toEqual({ startLine: 4, endLine: 4, executed: false });
    });

    it("handles large LCOV blob with many files", () => {
      const blocks = Array.from({ length: 50 }, (_, i) =>
        `SF:src/file${i}.ts\nDA:${i + 1},${i}\nend_of_record`
      );
      const lcov = blocks.join("\n");
      const m = parseLcovToStatementCovers(lcov);
      expect(m.size).toEqual(50);
      expect(m.get("src/file0.ts")).toEqual([{ startLine: 0, endLine: 0, executed: false }]);
      expect(m.get("src/file49.ts")).toEqual([{ startLine: 49, endLine: 49, executed: true }]);
    });
  });

  describe("mergeLcovMaps – advanced", () => {
    it("merges three maps with overlapping keys", () => {
      const s1 = { executed: true, startLine: 0, endLine: 0 };
      const s2 = { executed: false, startLine: 1, endLine: 1 };
      const s3 = { executed: true, startLine: 2, endLine: 2 };
      const m1 = new Map([["src/a.ts", [s1]]]);
      const m2 = new Map([["src/a.ts", [s2]]]);
      const m3 = new Map([["src/a.ts", [s3]]]);
      const result = mergeLcovMaps([m1, m2, m3]);
      expect(result.get("src/a.ts")).toEqual([s1, s2, s3]);
    });

    it("does not mutate input maps", () => {
      const s1 = { executed: true, startLine: 0, endLine: 0 };
      const s2 = { executed: false, startLine: 1, endLine: 1 };
      const arr1 = [s1];
      const m1 = new Map([["src/a.ts", arr1]]);
      const m2 = new Map([["src/a.ts", [s2]]]);
      mergeLcovMaps([m1, m2]);
      expect(arr1.length).toEqual(1);
      expect(m1.get("src/a.ts")!.length).toEqual(1);
    });

    it("handles maps with multiple keys each", () => {
      const s1 = { executed: true, startLine: 0, endLine: 0 };
      const s2 = { executed: false, startLine: 1, endLine: 1 };
      const s3 = { executed: true, startLine: 2, endLine: 2 };
      const m1 = new Map([["src/a.ts", [s1]], ["src/b.ts", [s2]]]);
      const m2 = new Map([["src/b.ts", [s3]], ["src/c.ts", [s1]]]);
      const result = mergeLcovMaps([m1, m2]);
      expect(result.size).toEqual(3);
      expect(result.get("src/a.ts")).toEqual([s1]);
      expect(result.get("src/b.ts")).toEqual([s2, s3]);
      expect(result.get("src/c.ts")).toEqual([s1]);
    });

    it("handles map with empty statement array for a key", () => {
      const m1 = new Map<string, { executed: boolean; startLine: number; endLine: number }[]>([["src/a.ts", []]]);
      const s1 = { executed: true, startLine: 0, endLine: 0 };
      const m2 = new Map([["src/a.ts", [s1]]]);
      const result = mergeLcovMaps([m1, m2]);
      expect(result.get("src/a.ts")).toEqual([s1]);
    });

    it("preserves statement order across merge", () => {
      const stmts1 = [
        { executed: true, startLine: 0, endLine: 0 },
        { executed: false, startLine: 1, endLine: 1 },
      ];
      const stmts2 = [
        { executed: true, startLine: 2, endLine: 2 },
      ];
      const m1 = new Map([["src/a.ts", stmts1]]);
      const m2 = new Map([["src/a.ts", stmts2]]);
      const result = mergeLcovMaps([m1, m2]);
      expect(result.get("src/a.ts")).toEqual([
        { executed: true, startLine: 0, endLine: 0 },
        { executed: false, startLine: 1, endLine: 1 },
        { executed: true, startLine: 2, endLine: 2 },
      ]);
    });
  });
});
