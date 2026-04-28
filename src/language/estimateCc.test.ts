import { describe, it, expect } from "vitest";
import { estimateCyclomaticComplexity } from "./estimateCc";

describe("estimateCyclomaticComplexity", () => {
  it("returns 1 for empty or trivial code", () => {
    expect(estimateCyclomaticComplexity("return 1")).toBe(1);
  });

  it("adds a decision for each if", () => {
    expect(estimateCyclomaticComplexity("if (a) { b(); } if (c) { d(); }")).toBeGreaterThanOrEqual(3);
  });
});

describe("mutation-killing: estimateCc.ts", () => {
  it("returns 1 for empty string", () => {
    expect(estimateCyclomaticComplexity("")).toBe(1);
  });

  it("returns 1 for whitespace-only source", () => {
    expect(estimateCyclomaticComplexity("   \n\t  ")).toBe(1);
  });

  it("returns 1 for source with no decisions", () => {
    expect(estimateCyclomaticComplexity("const x = 1;")).toBe(1);
  });

  // Kill regex mutations - test specific decision keywords
  it("counts if as a decision", () => {
    expect(estimateCyclomaticComplexity("if (x) {}")).toBe(2);
  });

  it("counts while as a decision", () => {
    expect(estimateCyclomaticComplexity("while (true) {}")).toBe(2);
  });

  it("counts for as a decision", () => {
    expect(estimateCyclomaticComplexity("for (;;) {}")).toBe(2);
  });

  it("counts case as a decision", () => {
    expect(estimateCyclomaticComplexity("switch(x) { case 1: break; }")).toBe(2);
  });

  it("counts catch as a decision", () => {
    expect(estimateCyclomaticComplexity("try {} catch(e) {}")).toBe(2);
  });

  it("counts && as a decision", () => {
    expect(estimateCyclomaticComplexity("if (a&&b) {}")).toBe(3);
  });

  it("counts || as a decision", () => {
    expect(estimateCyclomaticComplexity("if (a||b) {}")).toBe(3);
  });

  // Kill: Regex else\s+if → else\S+if or else\sif
  it("counts else if as a single decision", () => {
    expect(estimateCyclomaticComplexity("if (a) {} else if (b) {}")).toBe(3);
  });

  it("counts else  if (multiple spaces) as a decision", () => {
    expect(estimateCyclomaticComplexity("if (a) {} else  if (b) {}")).toBe(3);
  });

  // Kill: ternary regex mutations (\?\s* and [^;?:]+)
  it("counts ternary as a decision", () => {
    expect(estimateCyclomaticComplexity("const x = a ? b : c;")).toBe(2);
  });

  it("counts ternary with no space after ?", () => {
    expect(estimateCyclomaticComplexity("const x = a ?b : c;")).toBe(2);
  });

  it("counts ternary with multiple spaces after ?", () => {
    expect(estimateCyclomaticComplexity("const x = a ?  b : c;")).toBe(2);
  });

  it("counts ternary with longer expression between ? and :", () => {
    expect(estimateCyclomaticComplexity("const x = a ? foo(b) : c;")).toBe(2);
  });

  it("counts foreach as a decision", () => {
    expect(estimateCyclomaticComplexity("foreach ($x as $y) {}")).toBe(2);
  });

  it("counts multiple decisions correctly", () => {
    const source = "if (a) { while (b) { for (;;) {} } }";
    expect(estimateCyclomaticComplexity(source)).toBe(4);
  });

  it("returns at least 1 even with decisions", () => {
    expect(estimateCyclomaticComplexity("if (x) {}")).toBeGreaterThanOrEqual(1);
  });
});
