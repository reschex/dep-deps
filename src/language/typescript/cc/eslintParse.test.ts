import { describe, it, expect } from "vitest";
import { parseComplexityFromMessage, parseEslintComplexityJson } from "./eslintParse";

describe("parseComplexityFromMessage", () => {
  it("extracts complexity number", () => {
    expect(parseComplexityFromMessage("Function 'x' has a complexity of 12.")).toBe(12);
  });

  it("returns undefined for non-matching message", () => {
    expect(parseComplexityFromMessage("no complexity here")).toBeUndefined();
  });

  // Kill: ConditionalExpression L35 → true (always return parsed number)
  it("returns undefined for empty string", () => {
    expect(parseComplexityFromMessage("")).toBeUndefined();
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

  // Kill: ConditionalExpression L7 → false (skip !Array.isArray check)
  it("returns empty map for non-array JSON", () => {
    const m = parseEslintComplexityJson(JSON.stringify({ notAnArray: true }));
    expect(m.size).toBe(0);
  });

  it("returns empty map for invalid JSON", () => {
    const m = parseEslintComplexityJson("not json at all");
    expect(m.size).toBe(0);
  });

  // Kill: ConditionalExpression L14 → false, true — the filter condition
  // Kill: LogicalOperator L14 — rid check logic
  // Kill: EqualityOperator L14 — === to other operators
  it("skips messages with non-complexity ruleId", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "no-unused-vars", line: 5, message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  it("accepts @typescript-eslint/complexity ruleId", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "@typescript-eslint/complexity", line: 3, message: "has a complexity of 5." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.get(3)).toBe(5);
  });

  // Kill: StringLiteral L14 → "" — empty ruleId match
  it("skips messages with empty ruleId", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "", line: 5, message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  it("skips messages with missing ruleId", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ line: 5, message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  // Kill: typeof msg.line !== "number" check
  it("skips messages with non-number line", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "complexity", line: "five", message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  it("skips messages with undefined line", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "complexity", message: "has a complexity of 7." }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  // Kill: BlockStatement L16 → {} — skip the body that sets byLine
  it("actually stores complexity values in the map", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [
          { ruleId: "complexity", line: 1, message: "has a complexity of 3." },
          { ruleId: "complexity", line: 10, message: "has a complexity of 8." },
        ],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(2);
    expect(m.get(1)).toBe(3);
    expect(m.get(10)).toBe(8);
  });

  // Kill: ConditionalExpression L15 → false (skip the parseComplexityFromMessage check)
  it("skips messages where complexity cannot be parsed from text", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [{ ruleId: "complexity", line: 5, message: "something unrelated" }],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  // Kill: ConditionalExpression L20 → true (always use max when merging)
  it("takes max when multiple messages for same line", () => {
    const json = JSON.stringify([
      {
        filePath: "/a.ts",
        messages: [
          { ruleId: "complexity", line: 5, message: "has a complexity of 3." },
          { ruleId: "complexity", line: 5, message: "has a complexity of 8." },
        ],
      },
    ]);
    const m = parseEslintComplexityJson(json);
    expect(m.get(5)).toBe(8);
  });

  it("handles empty messages array", () => {
    const json = JSON.stringify([{ filePath: "/a.ts", messages: [] }]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });

  it("handles missing messages property", () => {
    const json = JSON.stringify([{ filePath: "/a.ts" }]);
    const m = parseEslintComplexityJson(json);
    expect(m.size).toBe(0);
  });
});
