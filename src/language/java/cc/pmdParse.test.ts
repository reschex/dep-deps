import { describe, it, expect } from "vitest";
import { parsePmdCyclomaticXml, extractComplexityFromMessage } from "./pmdParse";

describe("extractComplexityFromMessage", () => {
  it("extracts complexity number from PMD message", () => {
    expect(extractComplexityFromMessage(
      "The method 'foo' has a cyclomatic complexity of 12."
    )).toBe(12);
  });

  it("extracts from class-level message", () => {
    expect(extractComplexityFromMessage(
      "The class 'Bar' has a Modified Cyclomatic Complexity of 25."
    )).toBe(25);
  });

  it("returns undefined for unrecognized message", () => {
    expect(extractComplexityFromMessage("Some other violation")).toBeUndefined();
  });
});

describe("parsePmdCyclomaticXml", () => {
  it("parses a single CyclomaticComplexity violation", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pmd xmlns="http://pmd.sourceforge.net/report/2.0.0">
  <file name="/project/src/Foo.java">
    <violation beginline="10" endline="25" begincolumn="5" endcolumn="6"
      rule="CyclomaticComplexity" ruleset="Design" priority="3">
      The method 'process' has a cyclomatic complexity of 7.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(10)).toBe(7);
    expect(m.size).toBe(1);
  });

  it("parses multiple violations across different lines", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="5" rule="CyclomaticComplexity" priority="3">
      The method 'a' has a cyclomatic complexity of 3.
    </violation>
    <violation beginline="20" rule="CyclomaticComplexity" priority="3">
      The method 'b' has a cyclomatic complexity of 15.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(5)).toBe(3);
    expect(m.get(20)).toBe(15);
  });

  it("handles ModifiedCyclomaticComplexity rule name", () => {
    const xml = `<pmd>
  <file name="Bar.java">
    <violation beginline="8" rule="ModifiedCyclomaticComplexity" priority="3">
      The method 'x' has a cyclomatic complexity of 9.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(8)).toBe(9);
  });

  it("handles StdCyclomaticComplexity rule name", () => {
    const xml = `<pmd>
  <file name="Baz.java">
    <violation beginline="12" rule="StdCyclomaticComplexity" priority="3">
      The method 'y' has a cyclomatic complexity of 4.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(12)).toBe(4);
  });

  it("ignores non-complexity violations", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="1" rule="UnusedImports" priority="4">
      Unused import 'java.util.List'.
    </violation>
    <violation beginline="10" rule="CyclomaticComplexity" priority="3">
      The method 'z' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(1);
    expect(m.get(10)).toBe(5);
  });

  it("takes the max when rule appears on the same line", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" rule="CyclomaticComplexity" priority="3">
      The method 'a' has a cyclomatic complexity of 3.
    </violation>
    <violation beginline="10" rule="StdCyclomaticComplexity" priority="3">
      The method 'a' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(10)).toBe(5);
  });

  it("returns empty map for empty or invalid XML", () => {
    expect(parsePmdCyclomaticXml("")).toEqual(new Map());
    expect(parsePmdCyclomaticXml("not xml")).toEqual(new Map());
  });

  it("handles attribute order: rule before beginline", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation rule="CyclomaticComplexity" beginline="15" priority="3">
      The method 'q' has a cyclomatic complexity of 6.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.get(15)).toBe(6);
  });
});

describe("mutation-killing: pmdParse.ts", () => {
  // Kill: BlockStatement L29 → {} / ConditionalExpression L29 → false
  // This is the ruleRe.test(attrs) check — if skipped, non-cyclomatic rules would pass through
  it("skips violation with non-cyclomatic rule even if message contains complexity", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" rule="TooManyMethods" priority="3">
      has a complexity of 99.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(0);
  });

  // Kill: ConditionalExpression L33 → false — skip lineMatch check
  it("skips violation without beginline attribute", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation rule="CyclomaticComplexity" priority="3">
      The method has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(0);
  });

  // Kill: ConditionalExpression L38 → true, LogicalOperator L38
  // This is the !Number.isNaN(line) && cc !== undefined check
  it("skips violation with NaN line number", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="abc" rule="CyclomaticComplexity" priority="3">
      The method has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(0);
  });

  it("skips violation where complexity cannot be extracted from message", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" rule="CyclomaticComplexity" priority="3">
      The method has no complexity info.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(0);
  });

  // Ensure valid violations actually store values (kill BlockStatement mutations)
  it("stores complexity in map for valid violation", () => {
    const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="7" rule="CyclomaticComplexity" priority="3">
      The method 'foo' has a cyclomatic complexity of 11.
    </violation>
  </file>
</pmd>`;
    const m = parsePmdCyclomaticXml(xml);
    expect(m.size).toBe(1);
    expect(m.get(7)).toBe(11);
  });
});
