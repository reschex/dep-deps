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
