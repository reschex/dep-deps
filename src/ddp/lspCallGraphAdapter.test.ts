import { describe, it, expect } from "vitest";
import { collectCallEdgesViaAdapter, type CallHierarchyAdapter } from "./lspCallGraphAdapter";

function fakeAdapter(
  symbols: { id: string; uriStr: string }[],
  outgoing: Record<string, string[]>,
  cancelled = false
): CallHierarchyAdapter {
  return {
    async findFunctionSymbols() {
      return symbols;
    },
    async getOutgoingCalleeIds(symbolId: string) {
      return outgoing[symbolId] ?? [];
    },
    isCancelled() {
      return cancelled;
    },
  };
}

describe("collectCallEdgesViaAdapter", () => {
  it("builds edges from fake outgoing calls", async () => {
    const adapter = fakeAdapter(
      [
        { id: "A", uriStr: "file:///a.ts" },
        { id: "B", uriStr: "file:///a.ts" },
        { id: "M", uriStr: "file:///b.ts" },
      ],
      {
        A: ["M"],
        B: ["M"],
      }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([
      { caller: "A", callee: "M" },
      { caller: "B", callee: "M" },
    ]);
  });

  it("filters self-edges", async () => {
    const adapter = fakeAdapter(
      [{ id: "X", uriStr: "file:///x.ts" }],
      { X: ["X", "Y"] }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([{ caller: "X", callee: "Y" }]);
  });

  it("returns empty edges when no outgoing calls", async () => {
    const adapter = fakeAdapter(
      [{ id: "A", uriStr: "file:///a.ts" }],
      {}
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([]);
  });

  it("stops collecting when cancelled", async () => {
    let callCount = 0;
    const adapter: CallHierarchyAdapter = {
      async findFunctionSymbols() {
        return [
          { id: "A", uriStr: "file:///a.ts" },
          { id: "B", uriStr: "file:///a.ts" },
        ];
      },
      async getOutgoingCalleeIds(_id) {
        callCount++;
        return ["M"];
      },
      isCancelled() {
        // Cancel after first symbol is processed
        return callCount >= 1;
      },
    };
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(callCount).toBe(1);
    expect(edges.length).toBe(1);
  });

  it("produces correct edges for a star graph integrating with rank", async () => {
    const syms = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      uriStr: "file:///callers.ts",
    }));
    syms.push({ id: "M", uriStr: "file:///callee.ts" });

    const outgoing: Record<string, string[]> = {};
    for (let i = 0; i < 6; i++) {
      outgoing[`c${i}`] = ["M"];
    }

    const adapter = fakeAdapter(syms, outgoing);
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toHaveLength(6);
    for (const e of edges) {
      expect(e.callee).toBe("M");
    }
  });

  it("returns empty edges when findFunctionSymbols returns empty array", async () => {
    const adapter = fakeAdapter([], {});
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([]);
  });

  it("handles symbol with multiple outgoing callees", async () => {
    const adapter = fakeAdapter(
      [{ id: "A", uriStr: "file:///a.ts" }],
      { A: ["B", "C", "D"] }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([
      { caller: "A", callee: "B" },
      { caller: "A", callee: "C" },
      { caller: "A", callee: "D" },
    ]);
  });

  it("filters all callees when every callee is a self-edge", async () => {
    const adapter = fakeAdapter(
      [{ id: "X", uriStr: "file:///x.ts" }],
      { X: ["X", "X", "X"] }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([]);
  });

  it("handles duplicate callee ids across different callers", async () => {
    const adapter = fakeAdapter(
      [
        { id: "A", uriStr: "file:///a.ts" },
        { id: "B", uriStr: "file:///b.ts" },
      ],
      { A: ["M"], B: ["M"] }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([
      { caller: "A", callee: "M" },
      { caller: "B", callee: "M" },
    ]);
  });

  it("does not call getOutgoingCalleeIds when cancelled before first symbol", async () => {
    let getCallCount = 0;
    const adapter: CallHierarchyAdapter = {
      async findFunctionSymbols() {
        return [{ id: "A", uriStr: "file:///a.ts" }];
      },
      async getOutgoingCalleeIds() {
        getCallCount++;
        return ["B"];
      },
      isCancelled() {
        return true;
      },
    };
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(getCallCount).toBe(0);
    expect(edges).toEqual([]);
  });

  it("produces edges for a chain graph A -> B -> C", async () => {
    const adapter = fakeAdapter(
      [
        { id: "A", uriStr: "file:///a.ts" },
        { id: "B", uriStr: "file:///b.ts" },
        { id: "C", uriStr: "file:///c.ts" },
      ],
      { A: ["B"], B: ["C"] }
    );
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toEqual([
      { caller: "A", callee: "B" },
      { caller: "B", callee: "C" },
    ]);
  });

  it("handles many symbols (100+) without error", async () => {
    const syms = Array.from({ length: 150 }, (_, i) => ({
      id: `fn${i}`,
      uriStr: "file:///big.ts",
    }));
    const outgoing: Record<string, string[]> = {};
    for (let i = 0; i < 149; i++) {
      outgoing[`fn${i}`] = [`fn${i + 1}`];
    }
    const adapter = fakeAdapter(syms, outgoing);
    const edges = await collectCallEdgesViaAdapter(adapter);
    expect(edges).toHaveLength(149);
    expect(edges[0]).toEqual({ caller: "fn0", callee: "fn1" });
    expect(edges[148]).toEqual({ caller: "fn148", callee: "fn149" });
  });
});
