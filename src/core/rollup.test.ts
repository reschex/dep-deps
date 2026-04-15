import { describe, it, expect } from "vitest";
import { rollupFileRisk, decorationTier } from "./rollup";

describe("file rollup", () => {
  it("max mode takes maximum F per uri", () => {
    const m = rollupFileRisk(
      [
        { symbolId: "a", uri: "file:///x.ts", f: 10 },
        { symbolId: "b", uri: "file:///x.ts", f: 3 },
        { symbolId: "c", uri: "file:///y.ts", f: 7 },
      ],
      "max"
    );
    expect(m.get("file:///x.ts")).toBe(10);
    expect(m.get("file:///y.ts")).toBe(7);
  });

  it("sum mode sums F per uri", () => {
    const m = rollupFileRisk(
      [
        { symbolId: "a", uri: "file:///x.ts", f: 10 },
        { symbolId: "b", uri: "file:///x.ts", f: 3 },
      ],
      "sum"
    );
    expect(m.get("file:///x.ts")).toBe(13);
  });
});

describe("decorationTier (view-model)", () => {
  it("returns error when max F >= error threshold", () => {
    expect(decorationTier(200, 50, 150)).toBe("error");
  });

  it("returns warn between warn and error", () => {
    expect(decorationTier(100, 50, 150)).toBe("warn");
  });

  it("returns none below warn", () => {
    expect(decorationTier(10, 50, 150)).toBe("none");
  });
});
