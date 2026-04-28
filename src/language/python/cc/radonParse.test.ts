import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseRadonCcJson } from "./radonParse";

describe("parseRadonCcJson", () => {
  it("reads function blocks with lineno name complexity", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ type: "function", lineno: 10, name: "bar", complexity: 4 }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.get("10:bar")).toBe(4);
  });

  // Kill: ConditionalExpression L16 → false — skip non-matching files
  it("ignores blocks for a different file path", () => {
    const target = path.resolve("proj/foo.py");
    const other = path.resolve("proj/other.py");
    const json = JSON.stringify({
      [other]: [{ type: "function", lineno: 10, name: "bar", complexity: 4 }],
    });
    const m = parseRadonCcJson(json, target);
    expect(m.size).toBe(0);
  });

  // Kill: ConditionalExpression L20 → true — skip type check conditions
  // Kill: LogicalOperator L20 — || vs &&
  it("skips blocks with non-string name", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ lineno: 10, name: 123, complexity: 4 }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("skips blocks with non-number complexity", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ lineno: 10, name: "bar", complexity: "high" }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("skips blocks with non-number lineno", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ lineno: "ten", name: "bar", complexity: 4 }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("skips blocks with missing name", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ lineno: 10, complexity: 4 }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("skips blocks with missing complexity", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ lineno: 10, name: "bar" }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("skips blocks with missing lineno", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [{ name: "bar", complexity: 4 }],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("returns empty map for non-array file entry", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: "not an array",
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.size).toBe(0);
  });

  it("returns empty map for invalid JSON", () => {
    const m = parseRadonCcJson("invalid{json", "foo.py");
    expect(m.size).toBe(0);
  });

  it("reads multiple blocks from the same file", () => {
    const abs = path.resolve("proj/foo.py");
    const json = JSON.stringify({
      [abs]: [
        { lineno: 1, name: "foo", complexity: 3 },
        { lineno: 10, name: "bar", complexity: 7 },
      ],
    });
    const m = parseRadonCcJson(json, abs);
    expect(m.get("1:foo")).toBe(3);
    expect(m.get("10:bar")).toBe(7);
    expect(m.size).toBe(2);
  });
});
