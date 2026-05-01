/**
 * Tests for CLI impact tree formatter.
 *
 * Scenario: CLI text-based impact tree output
 * Scenario: CLI JSON output for impact tree
 * From: features/call-graph-visualization.feature (Phase 3: CLI Output)
 *
 * Produces ASCII tree formatting for LLM-optimised text output
 * and structured JSON for programmatic consumers.
 */

import { describe, it, expect } from "vitest";
import { formatImpactTreeText, formatImpactTreeJson } from "./formatImpactTree";
import type { CallerNode } from "./callerTree";
import type { SymbolMetrics } from "./analyze";
import { sym } from "./testFixtures";
import type { RiskLevel } from "./riskLevel";

/** Shorthand to build a CallersResult for testing. */
function callersResult(overrides: {
  symbol: string;
  file: string;
  riskLevel: RiskLevel;
  metrics?: Partial<SymbolMetrics>;
  tree?: CallerNode[];
  directCallers?: number;
  totalAffected?: number;
}) {
  return {
    symbol: overrides.symbol,
    file: overrides.file,
    metrics: sym({ id: "target", name: overrides.symbol, ...overrides.metrics }),
    riskLevel: overrides.riskLevel,
    impactSummary: {
      directCallers: overrides.directCallers ?? 0,
      totalAffected: overrides.totalAffected ?? 0,
    },
    callerTree: overrides.tree ?? [],
  };
}

describe("formatImpactTreeText", () => {
  it("formats an entry point with no callers", () => {
    const result = callersResult({
      symbol: "main",
      file: "src/index.ts",
      riskLevel: "LOW",
    });

    const text = formatImpactTreeText(result);

    expect(text).toContain("main");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("No callers (entry point)");
  });

  it("includes risk level and F score in the header line", () => {
    const result = callersResult({
      symbol: "processOrder",
      file: "src/orders.ts",
      riskLevel: "HIGH",
      metrics: { f: 210.0 },
    });

    const text = formatImpactTreeText(result);

    expect(text).toContain("Risk: HIGH (F=210.0)");
  });

  it("formats a single-level caller tree with ASCII box-drawing characters", () => {
    const tree: CallerNode[] = [
      { id: "checkout", depth: 1, recursive: false, children: [] },
      { id: "submitForm", depth: 1, recursive: false, children: [] },
    ];
    const metricsMap = new Map<string, SymbolMetrics>([
      ["checkout", sym({ id: "checkout", name: "handleCheckout", f: 189.2 })],
      ["submitForm", sym({ id: "submitForm", name: "submitOrderForm", f: 120.5 })],
    ]);

    const result = callersResult({
      symbol: "processOrder",
      file: "src/orders.ts",
      riskLevel: "MEDIUM",
      metrics: { f: 95.0 },
      tree,
      directCallers: 2,
      totalAffected: 2,
    });

    const text = formatImpactTreeText(result, metricsMap);

    // Should contain tree branch characters
    expect(text).toContain("handleCheckout");
    expect(text).toContain("F=189.2");
    expect(text).toContain("submitOrderForm");
    expect(text).toContain("F=120.5");
    // Impact summary at the bottom
    expect(text).toContain("Direct callers: 2");
    expect(text).toContain("Total affected: 2");
  });

  it("formats a multi-level tree matching the BDD scenario output", () => {
    // From features/call-graph-visualization.feature:
    //   └─ handleCheckout [F=189.2]
    //      ├─ POST /api/checkout [F=50.1]
    //      │  └─ apiRouter [F=35.0]
    //      └─ submitOrderForm [F=120.5]
    const tree: CallerNode[] = [
      {
        id: "checkout", depth: 1, recursive: false, children: [
          {
            id: "apiRoute", depth: 2, recursive: false, children: [
              { id: "apiRouter", depth: 3, recursive: false, children: [] },
            ],
          },
          { id: "submitForm", depth: 2, recursive: false, children: [] },
        ],
      },
    ];
    const metricsMap = new Map<string, SymbolMetrics>([
      ["checkout", sym({ id: "checkout", name: "handleCheckout", f: 189.2 })],
      ["apiRoute", sym({ id: "apiRoute", name: "POST /api/checkout", f: 50.1 })],
      ["apiRouter", sym({ id: "apiRouter", name: "apiRouter", f: 35.0 })],
      ["submitForm", sym({ id: "submitForm", name: "submitOrderForm", f: 120.5 })],
    ]);

    const result = callersResult({
      symbol: "processOrder",
      file: "src/orders.ts",
      riskLevel: "MEDIUM",
      metrics: { f: 95.0 },
      tree,
      directCallers: 1,
      totalAffected: 4,
    });

    const text = formatImpactTreeText(result, metricsMap);

    // Verify the exact tree structure with box-drawing characters
    expect(text).toContain("└─ handleCheckout [F=189.2]");
    expect(text).toContain("├─ POST /api/checkout [F=50.1]");
    expect(text).toContain("│  └─ apiRouter [F=35.0]");
    expect(text).toContain("└─ submitOrderForm [F=120.5]");
    expect(text).toContain("Total affected: 4");
  });

  it("marks recursive callers with RECURSIVE tag", () => {
    const tree: CallerNode[] = [
      {
        id: "B", depth: 1, recursive: false, children: [
          { id: "A", depth: 2, recursive: true, children: [] },
        ],
      },
    ];
    const metricsMap = new Map<string, SymbolMetrics>([
      ["B", sym({ id: "B", name: "processB", f: 10 })],
      ["A", sym({ id: "A", name: "processA", f: 20 })],
    ]);

    const result = callersResult({
      symbol: "processA",
      file: "src/process.ts",
      riskLevel: "LOW",
      metrics: { f: 20.0 },
      tree,
      directCallers: 1,
      totalAffected: 1,
    });

    const text = formatImpactTreeText(result, metricsMap);

    expect(text).toContain("RECURSIVE");
    expect(text).toContain("processA");
  });

  it("uses symbol ID as fallback name when metrics not found", () => {
    const tree: CallerNode[] = [
      { id: "unknown-id", depth: 1, recursive: false, children: [] },
    ];

    const result = callersResult({
      symbol: "target",
      file: "src/target.ts",
      riskLevel: "LOW",
      tree,
      directCallers: 1,
      totalAffected: 1,
    });

    const text = formatImpactTreeText(result);

    expect(text).toContain("unknown-id");
    expect(text).toContain("F=?");
  });
});

describe("formatImpactTreeJson", () => {
  it("produces valid JSON with the CallersResult schema", () => {
    const tree: CallerNode[] = [
      {
        id: "checkout", depth: 1, recursive: false, children: [
          { id: "apiRoute", depth: 2, recursive: false, children: [] },
        ],
      },
    ];
    const metricsMap = new Map<string, SymbolMetrics>([
      ["checkout", sym({ id: "checkout", name: "handleCheckout", f: 189.2, cc: 8, t: 0.3, r: 2.5, crap: 75.68 })],
      ["apiRoute", sym({ id: "apiRoute", name: "POST /api/checkout", f: 50.1, cc: 3, t: 0.8, r: 1.2, crap: 41.75 })],
    ]);

    const result = callersResult({
      symbol: "processOrder",
      file: "src/orders.ts",
      riskLevel: "MEDIUM",
      metrics: { f: 95.0 },
      tree,
      directCallers: 1,
      totalAffected: 2,
    });

    const json = formatImpactTreeJson(result, metricsMap);
    const parsed = JSON.parse(json);

    // Top-level schema fields
    expect(parsed.symbol).toBe("processOrder");
    expect(parsed.file).toBe("src/orders.ts");
    expect(parsed.riskLevel).toBe("MEDIUM");

    // Metrics for the target symbol
    expect(parsed.metrics.f).toBe(95.0);

    // Impact summary
    expect(parsed.impactSummary.directCallers).toBe(1);
    expect(parsed.impactSummary.totalAffected).toBe(2);

    // Caller tree with nested structure and resolved names
    expect(parsed.callerTree).toHaveLength(1);
    expect(parsed.callerTree[0].name).toBe("handleCheckout");
    expect(parsed.callerTree[0].metrics.f).toBe(189.2);
    expect(parsed.callerTree[0].children).toHaveLength(1);
    expect(parsed.callerTree[0].children[0].name).toBe("POST /api/checkout");
  });

  it("marks recursive nodes in JSON output", () => {
    const tree: CallerNode[] = [
      {
        id: "B", depth: 1, recursive: false, children: [
          { id: "A", depth: 2, recursive: true, children: [] },
        ],
      },
    ];
    const metricsMap = new Map<string, SymbolMetrics>([
      ["B", sym({ id: "B", name: "processB", f: 10 })],
      ["A", sym({ id: "A", name: "processA", f: 20 })],
    ]);

    const result = callersResult({
      symbol: "processA",
      file: "src/process.ts",
      riskLevel: "LOW",
      metrics: { f: 20.0 },
      tree,
      directCallers: 1,
      totalAffected: 1,
    });

    const json = formatImpactTreeJson(result, metricsMap);
    const parsed = JSON.parse(json);

    expect(parsed.callerTree[0].children[0].recursive).toBe(true);
  });

  it("omits callees field (impact tree shows callers only)", () => {
    const result = callersResult({
      symbol: "processOrder",
      file: "src/orders.ts",
      riskLevel: "LOW",
    });

    const json = formatImpactTreeJson(result);
    const parsed = JSON.parse(json);

    // The JSON should NOT contain a callees field — per the BDD scenario
    expect(parsed.callees).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('"callees"');
  });
});
