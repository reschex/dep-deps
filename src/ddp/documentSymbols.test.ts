import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
vi.mock("vscode", () => ({
  SymbolKind: {
    File: 0,
    Module: 1,
    Namespace: 2,
    Package: 3,
    Class: 4,
    Method: 5,
    Property: 6,
    Field: 7,
    Constructor: 8,
    Enum: 9,
    Interface: 10,
    Function: 11,
    Variable: 12,
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

import * as vscode from "vscode";
import {
  flattenFunctionSymbols,
  getFlatFunctionSymbols,
} from "./documentSymbols";

// ── helpers ──────────────────────────────────────────────────────────
function sym(
  name: string,
  kind: number,
  children: any[] = [],
): any {
  return { name, kind, children };
}

// ═════════════════════════════════════════════════════════════════════
// flattenFunctionSymbols
// ═════════════════════════════════════════════════════════════════════
describe("flattenFunctionSymbols", () => {
  it("returns empty array for empty symbols array", () => {
    expect(flattenFunctionSymbols([])).toEqual([]);
  });

  it("returns single Function symbol from flat list", () => {
    const fn = sym("myFunc", vscode.SymbolKind.Function);
    const result = flattenFunctionSymbols([fn]);
    expect(result).toEqual([fn]);
  });

  it("returns Method and Constructor symbols from flat list", () => {
    const method = sym("doStuff", vscode.SymbolKind.Method);
    const ctor = sym("constructor", vscode.SymbolKind.Constructor);
    const result = flattenFunctionSymbols([method, ctor]);
    expect(result).toEqual([method, ctor]);
  });

  it("skips non-function kinds", () => {
    const cls = sym("MyClass", vscode.SymbolKind.Class);
    const variable = sym("x", vscode.SymbolKind.Variable);
    const prop = sym("name", vscode.SymbolKind.Property);
    const iface = sym("IFoo", vscode.SymbolKind.Interface);
    const enumSym = sym("Color", vscode.SymbolKind.Enum);

    const result = flattenFunctionSymbols([cls, variable, prop, iface, enumSym]);
    expect(result).toEqual([]);
  });

  it("recursively extracts function symbols from nested children", () => {
    const method = sym("doStuff", vscode.SymbolKind.Method);
    const cls = sym("MyClass", vscode.SymbolKind.Class, [method]);

    const result = flattenFunctionSymbols([cls]);
    expect(result).toEqual([method]);
  });

  it("preserves pre-order traversal order", () => {
    const topFn = sym("topFn", vscode.SymbolKind.Function);
    const nestedMethod = sym("nested", vscode.SymbolKind.Method);
    const cls = sym("Cls", vscode.SymbolKind.Class, [nestedMethod]);
    const bottomFn = sym("bottomFn", vscode.SymbolKind.Function);

    const result = flattenFunctionSymbols([topFn, cls, bottomFn]);
    expect(result.map((s) => s.name)).toEqual(["topFn", "nested", "bottomFn"]);
  });

  it("collects top-level functions and nested methods together", () => {
    const fn = sym("standalone", vscode.SymbolKind.Function);
    const method = sym("classMethod", vscode.SymbolKind.Method);
    const cls = sym("Cls", vscode.SymbolKind.Class, [method]);

    const result = flattenFunctionSymbols([fn, cls]);
    expect(result.map((s) => s.name)).toEqual(["standalone", "classMethod"]);
  });

  it("extracts from deeply nested symbols (3+ levels)", () => {
    const innerMethod = sym("innerMethod", vscode.SymbolKind.Method);
    const innerClass = sym("Inner", vscode.SymbolKind.Class, [innerMethod]);
    const ns = sym("NS", vscode.SymbolKind.Namespace, [innerClass]);

    const result = flattenFunctionSymbols([ns]);
    expect(result).toEqual([innerMethod]);
  });

  it("accumulates into provided out array parameter", () => {
    const existing = sym("existing", vscode.SymbolKind.Function);
    const out = [existing];
    const newFn = sym("newFn", vscode.SymbolKind.Function);

    const result = flattenFunctionSymbols([newFn], out);
    expect(result).toBe(out);
    expect(result.map((s) => s.name)).toEqual(["existing", "newFn"]);
  });

  it("handles symbols with empty children array", () => {
    const fn = sym("fn", vscode.SymbolKind.Function, []);
    const result = flattenFunctionSymbols([fn]);
    expect(result).toEqual([fn]);
  });

  it("handles symbols with undefined children", () => {
    const fn = { name: "fn", kind: vscode.SymbolKind.Function, children: undefined };
    const cls = { name: "Cls", kind: vscode.SymbolKind.Class, children: undefined };

    const result = flattenFunctionSymbols([fn as any, cls as any]);
    expect(result.map((s) => s.name)).toEqual(["fn"]);
  });

  it("handles large number of symbols (100+)", () => {
    const symbols = Array.from({ length: 120 }, (_, i) =>
      sym(`fn${i}`, vscode.SymbolKind.Function),
    );
    const result = flattenFunctionSymbols(symbols);
    expect(result.length).toBe(120);
    expect(result[0].name).toBe("fn0");
    expect(result[119].name).toBe("fn119");
  });

  it("returns empty when all children are non-function kinds", () => {
    const prop = sym("x", vscode.SymbolKind.Property);
    const field = sym("y", vscode.SymbolKind.Field);
    const cls = sym("Cls", vscode.SymbolKind.Class, [prop, field]);

    const result = flattenFunctionSymbols([cls]);
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// getFlatFunctionSymbols
// ═════════════════════════════════════════════════════════════════════
describe("getFlatFunctionSymbols", () => {
  const fakeUri = { toString: () => "file:///src/a.ts" } as vscode.Uri;

  beforeEach(() => {
    vi.mocked(vscode.commands.executeCommand).mockReset();
  });

  it("returns flattened function symbols when provider succeeds", async () => {
    const method = sym("doIt", vscode.SymbolKind.Method);
    const cls = sym("Svc", vscode.SymbolKind.Class, [method]);
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([cls] as any);

    const result = await getFlatFunctionSymbols(fakeUri);
    expect(result.map((s) => s.name)).toEqual(["doIt"]);
  });

  it("returns empty array when provider returns undefined", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

    const result = await getFlatFunctionSymbols(fakeUri);
    expect(result).toEqual([]);
  });

  it("returns empty array when provider returns empty array", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([] as any);

    const result = await getFlatFunctionSymbols(fakeUri);
    expect(result).toEqual([]);
  });

  it("returns empty array when provider throws an error", async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
      new Error("provider crashed"),
    );

    const result = await getFlatFunctionSymbols(fakeUri);
    expect(result).toEqual([]);
  });

  it("passes URI to executeCommand correctly", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([] as any);

    await getFlatFunctionSymbols(fakeUri);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "vscode.executeDocumentSymbolProvider",
      fakeUri,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// bugmagnet session 2026-04-15
// ═════════════════════════════════════════════════════════════════════
describe("bugmagnet session 2026-04-15", () => {
  // ─── flattenFunctionSymbols — complex interactions ────────────────
  describe("flattenFunctionSymbols — complex interactions", () => {
    it("collects a function that itself has function children", () => {
      // A function containing a nested function — both should appear
      const inner = sym("inner", vscode.SymbolKind.Function);
      const outer = sym("outer", vscode.SymbolKind.Function, [inner]);

      const result = flattenFunctionSymbols([outer]);
      expect(result.map((s) => s.name)).toEqual(["outer", "inner"]);
    });

    it("collects constructor with nested method inside", () => {
      const method = sym("init", vscode.SymbolKind.Method);
      const ctor = sym("constructor", vscode.SymbolKind.Constructor, [method]);

      const result = flattenFunctionSymbols([ctor]);
      expect(result.map((s) => s.name)).toEqual(["constructor", "init"]);
    });

    it("handles 5-level deep nesting", () => {
      const deepFn = sym("deepFn", vscode.SymbolKind.Function);
      const l4 = sym("l4", vscode.SymbolKind.Namespace, [deepFn]);
      const l3 = sym("l3", vscode.SymbolKind.Module, [l4]);
      const l2 = sym("l2", vscode.SymbolKind.Class, [l3]);
      const l1 = sym("l1", vscode.SymbolKind.Namespace, [l2]);

      const result = flattenFunctionSymbols([l1]);
      expect(result.map((s) => s.name)).toEqual(["deepFn"]);
    });

    it("handles multiple classes each with multiple methods", () => {
      const m1 = sym("m1", vscode.SymbolKind.Method);
      const m2 = sym("m2", vscode.SymbolKind.Method);
      const cls1 = sym("A", vscode.SymbolKind.Class, [m1, m2]);

      const m3 = sym("m3", vscode.SymbolKind.Constructor);
      const m4 = sym("m4", vscode.SymbolKind.Method);
      const cls2 = sym("B", vscode.SymbolKind.Class, [m3, m4]);

      const result = flattenFunctionSymbols([cls1, cls2]);
      expect(result.map((s) => s.name)).toEqual(["m1", "m2", "m3", "m4"]);
    });

    it("collects function siblings alongside non-function siblings", () => {
      const method = sym("handle", vscode.SymbolKind.Method);
      const prop = sym("name", vscode.SymbolKind.Property);
      const field = sym("count", vscode.SymbolKind.Field);
      const ctor = sym("constructor", vscode.SymbolKind.Constructor);
      const cls = sym("Svc", vscode.SymbolKind.Class, [prop, method, field, ctor]);

      const result = flattenFunctionSymbols([cls]);
      expect(result.map((s) => s.name)).toEqual(["handle", "constructor"]);
    });

    it("handles wide tree with many top-level non-function symbols", () => {
      const symbols = [
        sym("A", vscode.SymbolKind.Class),
        sym("B", vscode.SymbolKind.Interface),
        sym("fn", vscode.SymbolKind.Function),
        sym("C", vscode.SymbolKind.Enum),
        sym("D", vscode.SymbolKind.Variable),
        sym("fn2", vscode.SymbolKind.Method),
      ];
      const result = flattenFunctionSymbols(symbols);
      expect(result.map((s) => s.name)).toEqual(["fn", "fn2"]);
    });
  });

  // ─── flattenFunctionSymbols — accumulator edge cases ──────────────
  describe("flattenFunctionSymbols — accumulator edge cases", () => {
    it("returns same reference when called with empty input and pre-filled out", () => {
      const existing = sym("a", vscode.SymbolKind.Function);
      const out = [existing];
      const result = flattenFunctionSymbols([], out);
      expect(result).toBe(out);
      expect(result.length).toBe(1);
    });

    it("accumulates across multiple calls using same out array", () => {
      const out: any[] = [];
      flattenFunctionSymbols([sym("a", vscode.SymbolKind.Function)], out);
      flattenFunctionSymbols([sym("b", vscode.SymbolKind.Method)], out);
      flattenFunctionSymbols([sym("c", vscode.SymbolKind.Constructor)], out);

      expect(out.map((s) => s.name)).toEqual(["a", "b", "c"]);
    });
  });

  // ─── flattenFunctionSymbols — boundary / edge cases ───────────────
  describe("flattenFunctionSymbols — boundary conditions", () => {
    it("handles symbol with null children gracefully via optional chaining", () => {
      const s = { name: "fn", kind: vscode.SymbolKind.Function, children: null };
      const result = flattenFunctionSymbols([s as any]);
      expect(result.map((r) => r.name)).toEqual(["fn"]);
    });

    it("handles class with children containing only one function among many non-functions", () => {
      const children = [
        sym("a", vscode.SymbolKind.Variable),
        sym("b", vscode.SymbolKind.Property),
        sym("c", vscode.SymbolKind.Field),
        sym("d", vscode.SymbolKind.Enum),
        sym("target", vscode.SymbolKind.Method),
        sym("e", vscode.SymbolKind.Interface),
      ];
      const cls = sym("Big", vscode.SymbolKind.Class, children);
      const result = flattenFunctionSymbols([cls]);
      expect(result.map((s) => s.name)).toEqual(["target"]);
    });

    it("handles diamond-like structure (same symbol kind at different branches)", () => {
      const m1 = sym("shared", vscode.SymbolKind.Method);
      const m2 = sym("shared", vscode.SymbolKind.Method);
      const cls1 = sym("A", vscode.SymbolKind.Class, [m1]);
      const cls2 = sym("B", vscode.SymbolKind.Class, [m2]);

      const result = flattenFunctionSymbols([cls1, cls2]);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(m1);
      expect(result[1]).toBe(m2);
    });
  });

  // ─── getFlatFunctionSymbols — error resilience ────────────────────
  describe("getFlatFunctionSymbols — error resilience", () => {
    const fakeUri = { toString: () => "file:///test.ts" } as vscode.Uri;

    beforeEach(() => {
      vi.mocked(vscode.commands.executeCommand).mockReset();
    });

    it("returns empty array when provider returns null", async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null as any);

      const result = await getFlatFunctionSymbols(fakeUri);
      expect(result).toEqual([]);
    });

    it("returns only function symbols when provider returns mixed kinds", async () => {
      const fn = sym("fn", vscode.SymbolKind.Function);
      const cls = sym("Cls", vscode.SymbolKind.Class);
      const variable = sym("x", vscode.SymbolKind.Variable);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(
        [fn, cls, variable] as any,
      );

      const result = await getFlatFunctionSymbols(fakeUri);
      expect(result.map((s) => s.name)).toEqual(["fn"]);
    });

    it("flattens nested structure from provider response", async () => {
      const method = sym("handle", vscode.SymbolKind.Method);
      const ctor = sym("constructor", vscode.SymbolKind.Constructor);
      const cls = sym("Svc", vscode.SymbolKind.Class, [method, ctor]);
      const topFn = sym("helper", vscode.SymbolKind.Function);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(
        [cls, topFn] as any,
      );

      const result = await getFlatFunctionSymbols(fakeUri);
      expect(result.map((s) => s.name)).toEqual(["handle", "constructor", "helper"]);
    });

    it("does not throw when provider rejects multiple times in sequence", async () => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error("fail"));

      const r1 = await getFlatFunctionSymbols(fakeUri);
      const r2 = await getFlatFunctionSymbols(fakeUri);
      expect(r1).toEqual([]);
      expect(r2).toEqual([]);
    });

    it("recovers after error and returns results on next call", async () => {
      vi.mocked(vscode.commands.executeCommand)
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce([sym("fn", vscode.SymbolKind.Function)] as any);

      const r1 = await getFlatFunctionSymbols(fakeUri);
      const r2 = await getFlatFunctionSymbols(fakeUri);
      expect(r1).toEqual([]);
      expect(r2.map((s) => s.name)).toEqual(["fn"]);
    });
  });
});
