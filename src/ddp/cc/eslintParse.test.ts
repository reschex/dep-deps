import { describe, it, expect } from "vitest";
import { parseComplexityFromMessage, parseEslintComplexityJson } from "./eslintParse";

describe("parseComplexityFromMessage", () => {
  it("extracts complexity number", () => {
    expect(parseComplexityFromMessage("Function 'x' has a complexity of 12.")).toBe(12);
  });
});

describe("parseEslintComplexityJson", () => {
  it("maps line to complexity from complexity rule", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "complexity", line: 5, message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.get(5)).toBe(7);
  });
});
