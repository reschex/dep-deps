import { describe, it, expect } from "vitest";
import { edgesFromCallerCallees } from "./graphBuilder";

describe("edgesFromCallerCallees", () => {
  it("dedupes self-edges", () => {
    const e = edgesFromCallerCallees([{ callerId: "a", calleeIds: ["a", "b"] }]);
    expect(e).toEqual([{ caller: "a", callee: "b" }]);
  });
});
