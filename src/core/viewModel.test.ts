import { describe, it, expect } from "vitest";
import {
  sortSymbolsByFDescending,
  symbolsForFile,
  formatHoverBreakdown,
  formatCodeLensTitle,
  decorationTier,
} from "./viewModel";
import type { SymbolMetrics } from "./analyze";

function sym(overrides: Partial<SymbolMetrics> & { id: string }): SymbolMetrics {
  return {
    uri: "file:///a.ts",
    name: "fn",
    cc: 2,
    t: 0.5,
    r: 1,
    crap: 2.25,
    f: 2.25,
    ...overrides,
  };
}

describe("sortSymbolsByFDescending", () => {
  it("sorts highest F first", () => {
    const list = [sym({ id: "a", f: 3 }), sym({ id: "b", f: 10 }), sym({ id: "c", f: 7 })];
    const sorted = sortSymbolsByFDescending(list);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the original list", () => {
    const list = [sym({ id: "a", f: 5 }), sym({ id: "b", f: 1 })];
    const sorted = sortSymbolsByFDescending(list);
    expect(sorted).not.toBe(list);
    expect(list[0].id).toBe("a");
  });
});

describe("symbolsForFile", () => {
  it("filters symbols matching the uri", () => {
    const list = [
      sym({ id: "a", uri: "file:///x.ts" }),
      sym({ id: "b", uri: "file:///y.ts" }),
      sym({ id: "c", uri: "file:///x.ts" }),
    ];
    const filtered = symbolsForFile("file:///x.ts", list);
    expect(filtered.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("returns empty array when no match", () => {
    expect(symbolsForFile("file:///z.ts", [sym({ id: "a" })])).toEqual([]);
  });
});

describe("formatHoverBreakdown", () => {
  it("contains all five metric values and labels", () => {
    const s = sym({ id: "x", r: 3.456, crap: 12.34, cc: 5, t: 0.72, f: 42.6 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("F=42.6");
    expect(text).toContain("R (rank): 3.456");
    expect(text).toContain("CRAP: 12.34");
    expect(text).toContain("CC: 5");
    expect(text).toContain("T (coverage): 72%");
  });

  it("includes interpretation string", () => {
    const text = formatHoverBreakdown(sym({ id: "x" }));
    expect(text).toContain("higher impact");
  });
});

describe("formatCodeLensTitle", () => {
  it("produces compact DDP title with F, R, CRAP", () => {
    const s = sym({ id: "x", f: 42.6, r: 3.456, crap: 12.34 });
    const title = formatCodeLensTitle(s);
    expect(title).toMatch(/^DDP F=43/);
    expect(title).toContain("R=3.46");
    expect(title).toContain("CRAP=12.3");
  });
});

describe("decorationTier (re-export)", () => {
  it("returns error when fileMaxF >= error threshold", () => {
    expect(decorationTier(200, 50, 150)).toBe("error");
  });

  it("returns warn between thresholds", () => {
    expect(decorationTier(80, 50, 150)).toBe("warn");
  });

  it("returns none below warn threshold", () => {
    expect(decorationTier(10, 50, 150)).toBe("none");
  });

  it("returns warn exactly at warn boundary", () => {
    expect(decorationTier(50, 50, 150)).toBe("warn");
  });

  it("returns error exactly at error boundary", () => {
    expect(decorationTier(150, 50, 150)).toBe("error");
  });
});
