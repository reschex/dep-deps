import { describe, it, expect } from "vitest";
import { parseJacocoToStatementCovers } from "./jacocoParse";

describe("parseJacocoToStatementCovers", () => {
  it("parses a single sourcefile with line elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="MyProject">
  <package name="com/example">
    <sourcefile name="Foo.java">
      <line nr="10" mi="0" ci="3" mb="0" cb="0"/>
      <line nr="11" mi="2" ci="0" mb="0" cb="0"/>
      <line nr="12" mi="0" ci="1" mb="1" cb="1"/>
    </sourcefile>
  </package>
</report>`;

    const result = parseJacocoToStatementCovers(xml);
    const stmts = result.get("com/example/Foo.java");
    expect(stmts).toBeDefined();
    expect(stmts).toHaveLength(3);
    // line 10: ci=3 → executed, 0-based line 9
    expect(stmts![0]).toEqual({ startLine: 9, endLine: 9, executed: true });
    // line 11: ci=0 → not executed, 0-based line 10
    expect(stmts![1]).toEqual({ startLine: 10, endLine: 10, executed: false });
    // line 12: ci=1 → executed, 0-based line 11
    expect(stmts![2]).toEqual({ startLine: 11, endLine: 11, executed: true });
  });

  it("parses multiple packages with multiple sourcefiles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="Multi">
  <package name="com/alpha">
    <sourcefile name="A.java">
      <line nr="1" mi="0" ci="1" mb="0" cb="0"/>
    </sourcefile>
  </package>
  <package name="com/beta">
    <sourcefile name="B.java">
      <line nr="5" mi="3" ci="0" mb="0" cb="0"/>
    </sourcefile>
    <sourcefile name="C.java">
      <line nr="20" mi="0" ci="2" mb="0" cb="0"/>
      <line nr="21" mi="1" ci="0" mb="0" cb="0"/>
    </sourcefile>
  </package>
</report>`;

    const result = parseJacocoToStatementCovers(xml);
    expect(result.size).toBe(3);
    expect(result.get("com/alpha/A.java")).toEqual([
      { startLine: 0, endLine: 0, executed: true },
    ]);
    expect(result.get("com/beta/B.java")).toEqual([
      { startLine: 4, endLine: 4, executed: false },
    ]);
    expect(result.get("com/beta/C.java")).toEqual([
      { startLine: 19, endLine: 19, executed: true },
      { startLine: 20, endLine: 20, executed: false },
    ]);
  });

  it("returns empty map for empty string", () => {
    expect(parseJacocoToStatementCovers("").size).toBe(0);
  });

  it("returns empty map for whitespace-only input", () => {
    expect(parseJacocoToStatementCovers("   \n\n  ").size).toBe(0);
  });

  it("returns empty map for XML with no package elements", () => {
    const xml = `<?xml version="1.0"?><report name="Empty"></report>`;
    expect(parseJacocoToStatementCovers(xml).size).toBe(0);
  });

  it("skips sourcefile with no line elements", () => {
    const xml = `<report name="X">
  <package name="p">
    <sourcefile name="Empty.java">
      <counter type="LINE" missed="0" covered="0"/>
    </sourcefile>
  </package>
</report>`;
    expect(parseJacocoToStatementCovers(xml).size).toBe(0);
  });

  it("handles default package (empty package name)", () => {
    const xml = `<report name="X">
  <package name="">
    <sourcefile name="Main.java">
      <line nr="1" mi="0" ci="1" mb="0" cb="0"/>
    </sourcefile>
  </package>
</report>`;
    const result = parseJacocoToStatementCovers(xml);
    expect(result.get("Main.java")).toEqual([
      { startLine: 0, endLine: 0, executed: true },
    ]);
  });

  it("skips line elements with non-numeric nr attribute", () => {
    const xml = `<report name="X">
  <package name="p">
    <sourcefile name="Bad.java">
      <line nr="abc" mi="0" ci="1" mb="0" cb="0"/>
      <line nr="5" mi="0" ci="2" mb="0" cb="0"/>
    </sourcefile>
  </package>
</report>`;
    const result = parseJacocoToStatementCovers(xml);
    // "abc" won't match \d+ in regex, so only line 5 is captured
    expect(result.get("p/Bad.java")).toEqual([
      { startLine: 4, endLine: 4, executed: true },
    ]);
  });

  it("handles truncated XML gracefully", () => {
    const xml = `<report name="X"><package name="p"><sourcefile name="T.java"><line nr="1" mi="0" ci="1" mb="0" cb="0"/>`;
    // No closing tags — parser should still extract what it can
    const result = parseJacocoToStatementCovers(xml);
    // The sourcefile regex requires </sourcefile>, so this won't match
    expect(result.size).toBe(0);
  });
});
