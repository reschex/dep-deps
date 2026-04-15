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
});
