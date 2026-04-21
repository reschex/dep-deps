import { describe, it, expect } from "vitest";
import { computeSymbolMetrics, type SymbolInput } from "./analyze";
import { sortSymbols, symbolsForFile } from "./viewModel";

describe("smoke: core pipeline end-to-end", () => {
  const symbols: SymbolInput[] = [
    { id: "a", uri: "file:///src/a.ts", name: "parse", cc: 8, t: 0.7 },
    { id: "b", uri: "file:///src/a.ts", name: "validate", cc: 3, t: 1.0 },
    { id: "c", uri: "file:///src/b.ts", name: "render", cc: 12, t: 0.2 },
  ];
  const edges = [
    { caller: "a", callee: "c" },
    { caller: "b", callee: "c" },
  ];

  it("computes metrics, sorts, and filters by file without error", () => {
    const metrics = computeSymbolMetrics(edges, symbols);
    expect(metrics).toHaveLength(3);

    for (const m of metrics) {
      expect(m.r).toBeGreaterThanOrEqual(1);
      expect(m.crap).toBeGreaterThan(0);
      expect(m.f).toBeGreaterThan(0);
      expect(m.g).toBe(1);
      expect(m.fPrime).toBe(m.f);
    }

    const renderMetric = metrics.find((m) => m.id === "c")!;
    expect(renderMetric.r).toBeGreaterThan(1);

    const sorted = sortSymbols(metrics, "fPrime");
    expect(sorted[0].fPrime).toBeGreaterThanOrEqual(sorted[1].fPrime);

    const fileA = symbolsForFile("file:///src/a.ts", metrics);
    expect(fileA).toHaveLength(2);
    expect(fileA.every((s) => s.uri === "file:///src/a.ts")).toBe(true);
  });
});
