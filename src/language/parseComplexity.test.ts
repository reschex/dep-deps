import { describe, it, expect } from "vitest";
import { parseComplexityFromMessage } from "./parseComplexity";

describe("parseComplexityFromMessage", () => {
  it("extracts complexity number from standard message", () => {
    expect(parseComplexityFromMessage("Function 'foo' has a complexity of 12.")).toBe(12);
  });

  it("extracts complexity from PMD-style message", () => {
    expect(parseComplexityFromMessage("The method 'bar' has a cyclomatic complexity of 7.")).toBe(7);
  });

  it("is case-insensitive", () => {
    expect(parseComplexityFromMessage("Complexity of 5")).toBe(5);
  });

  it("returns undefined when no match", () => {
    expect(parseComplexityFromMessage("no complexity here")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseComplexityFromMessage("")).toBeUndefined();
  });
});
