import { describe, it, expect } from "vitest";
import {
  sortSymbols,
  symbolsForFile,
  formatHoverBreakdown,
  formatCodeLensTitle,
  decorationTier,
} from "./viewModel";
import { sym } from "./testFixtures";

describe("sortSymbols", () => {
  it("sorts by G descending", () => {
    const list = [
      sym({ id: "a", g: 1.2 }),
      sym({ id: "b", g: 3.5 }),
      sym({ id: "c", g: 2.1 }),
    ];
    const sorted = sortSymbols(list, "g");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by fPrime descending", () => {
    const list = [
      sym({ id: "a", fPrime: 5 }),
      sym({ id: "b", fPrime: 25 }),
      sym({ id: "c", fPrime: 12 }),
    ];
    const sorted = sortSymbols(list, "fPrime");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by CC descending", () => {
    const list = [
      sym({ id: "a", cc: 3 }),
      sym({ id: "b", cc: 10 }),
      sym({ id: "c", cc: 7 }),
    ];
    const sorted = sortSymbols(list, "cc");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by CRAP descending", () => {
    const list = [
      sym({ id: "a", crap: 2 }),
      sym({ id: "b", crap: 20 }),
      sym({ id: "c", crap: 8 }),
    ];
    const sorted = sortSymbols(list, "crap");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by F descending", () => {
    const list = [
      sym({ id: "a", f: 3 }),
      sym({ id: "b", f: 10 }),
      sym({ id: "c", f: 7 }),
    ];
    const sorted = sortSymbols(list, "f");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the original list", () => {
    const list = [sym({ id: "a", cc: 5 }), sym({ id: "b", cc: 1 })];
    const sorted = sortSymbols(list, "cc");
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

  it("explains high CC with low coverage as undertested complexity", () => {
    const s = sym({ id: "x", cc: 15, t: 0.1, crap: 337.6, f: 337.6, r: 1 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("complex");
    expect(text).toContain("coverage");
  });

  it("notes well-tested complex code is mitigated by coverage", () => {
    const s = sym({ id: "x", cc: 12, t: 0.95, crap: 12.0, f: 12.0, r: 1 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("well-tested");
    expect(text).not.toContain("write tests");
  });

  it("warns about cascading failures when R is high and CRAP is high", () => {
    const s = sym({ id: "x", r: 8.5, crap: 120, f: 1020, cc: 15, t: 0.2 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("cascade");
    expect(text).toContain("dependents");
  });

  it("flags frequently-changed risky code as most urgent", () => {
    const s = sym({ id: "x", f: 200, g: 3.2, fPrime: 640, cc: 10, t: 0.3, r: 2, crap: 100 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("frequently changed");
    expect(text).toContain("urgent");
  });

  it("notes widely-depended code even with low CRAP", () => {
    const s = sym({ id: "x", r: 10, crap: 3, f: 30, cc: 3, t: 0.95 });
    const text = formatHoverBreakdown(s);
    expect(text).toContain("Widely depended upon");
  });

  it("stacks multiple insights when several risk factors apply", () => {
    const s = sym({ id: "x", cc: 15, t: 0.1, r: 5, crap: 200, f: 1000, g: 3.5, fPrime: 3500 });
    const text = formatHoverBreakdown(s);
    // Should have all three: complexity, cascade, and churn
    expect(text).toContain("complexity with low coverage");
    expect(text).toContain("cascade through dependents");
    expect(text).toContain("frequently changed");
  });

  it("shows no insight for low-risk code", () => {
    const s = sym({ id: "x", cc: 2, t: 0.9, r: 1.0, crap: 2.02, f: 2.02, g: 1 });
    const text = formatHoverBreakdown(s);
    // Should not contain any of the dynamic insights
    expect(text).not.toContain("complex");
    expect(text).not.toContain("cascade");
    expect(text).not.toContain("urgent");
    expect(text).not.toContain("well-tested");
    // The breakdown itself should still contain the metrics
    expect(text).toContain("CC: 2");
    expect(text).toContain("T (coverage): 90%");
  });

  describe("threshold boundaries", () => {
    it("does not fire the complexity insight at cc=9 (one below HIGH_CC)", () => {
      const text = formatHoverBreakdown(sym({ id: "x", cc: 9, t: 0.1, r: 1, crap: 5, f: 5, g: 1 }));
      expect(text).not.toContain("complexity");
    });

    it("fires the complexity insight at cc=10 (at HIGH_CC)", () => {
      const text = formatHoverBreakdown(sym({ id: "x", cc: 10, t: 0.1, r: 1, crap: 5, f: 5, g: 1 }));
      expect(text).toContain("complexity with low coverage");
    });

    it("does not fire the churn insight at g=2.0 (at HIGH_CHURN, not above)", () => {
      const text = formatHoverBreakdown(sym({ id: "x", cc: 5, t: 0.5, r: 1, crap: 5, f: 200, g: 2.0, fPrime: 400 }));
      expect(text).not.toContain("frequently changed");
    });

    it("fires the churn insight at g=2.1 (just above HIGH_CHURN)", () => {
      const text = formatHoverBreakdown(sym({ id: "x", cc: 5, t: 0.5, r: 1, crap: 5, f: 200, g: 2.1, fPrime: 420 }));
      expect(text).toContain("frequently changed");
    });

    it("does not fire the cascade insight when crap is below HIGH_CRAP_WITH_RISK", () => {
      // r >= HIGH_RANK_WITH_RISK but crap=29 (one below threshold) → widely depended, not cascade
      const text = formatHoverBreakdown(sym({ id: "x", cc: 3, t: 0.9, r: 3, crap: 29, f: 30, g: 1 }));
      expect(text).not.toContain("cascade");
    });

    it("fires the cascade insight when both r and crap meet their thresholds", () => {
      const text = formatHoverBreakdown(sym({ id: "x", cc: 3, t: 0.9, r: 3, crap: 30, f: 90, g: 1 }));
      expect(text).toContain("cascade through dependents");
    });
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
