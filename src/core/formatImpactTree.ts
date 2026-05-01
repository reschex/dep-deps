/**
 * CLI impact tree formatters — text and JSON serialisation.
 *
 * Text format: ASCII tree optimised for terminal output and LLM context windows.
 * JSON format: Structured CallersResult for MCP server and programmatic consumers.
 */

import type { CallerNode, ImpactSummary } from "./callerTree";
import type { SymbolMetrics } from "./analyze";
import type { RiskLevel } from "./riskLevel";

/** Structured result for the `ddp callers` sub-command. */
export type CallersResult = {
  readonly symbol: string;
  readonly file: string;
  readonly metrics: SymbolMetrics;
  readonly riskLevel: RiskLevel;
  readonly impactSummary: ImpactSummary;
  readonly callerTree: readonly CallerNode[];
};

/**
 * Format a CallersResult as an ASCII text tree for terminal / LLM output.
 *
 * @param result     The callers result to format.
 * @param metricsById Optional map of symbol ID → metrics for resolving display names and F scores.
 */
export function formatImpactTreeText(
  result: CallersResult,
  metricsById: ReadonlyMap<string, SymbolMetrics> = new Map(),
): string {
  const lines: string[] = [];

  lines.push(`IMPACT TREE: ${result.symbol}`);
  lines.push(`File: ${result.file}`);
  lines.push(`Risk: ${result.riskLevel} (F=${result.metrics.f.toFixed(1)})`);
  lines.push("");

  if (result.callerTree.length === 0) {
    lines.push("No callers (entry point)");
  } else {
    renderNodes(result.callerTree, metricsById, "", lines);
    lines.push("");
    lines.push("IMPACT SUMMARY:");
    lines.push(`  Direct callers: ${result.impactSummary.directCallers}`);
    lines.push(`  Total affected: ${result.impactSummary.totalAffected}`);
  }

  return lines.join("\n");
}

/**
 * Recursively render caller nodes as an ASCII tree.
 *
 * @param nodes        Caller nodes at this level.
 * @param metricsById  Metric lookup for display names and F scores.
 * @param prefix       Indentation prefix (built up from parent levels).
 * @param out          Output line accumulator.
 */
function renderNodes(
  nodes: readonly CallerNode[],
  metricsById: ReadonlyMap<string, SymbolMetrics>,
  prefix: string,
  out: string[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    const childPrefix = isLast ? "   " : "│  ";

    const metrics = metricsById.get(node.id);
    const name = metrics?.name ?? node.id;
    const fStr = metrics ? `F=${metrics.f.toFixed(1)}` : "F=?";
    const recursiveTag = node.recursive ? " 🔄 RECURSIVE" : "";

    out.push(`${prefix}${connector}${name} [${fStr}]${recursiveTag}`);

    if (node.children.length > 0) {
      renderNodes(node.children, metricsById, `${prefix}${childPrefix}`, out);
    }
  }
}

// ── JSON formatter ──────────────────────────────────────────────────────

/** JSON representation of a caller node (with resolved name and metrics). */
type JsonCallerNode = {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly recursive: boolean;
  readonly metrics: { f: number; cc: number; t: number; r: number; crap: number } | null;
  readonly children: readonly JsonCallerNode[];
};

/**
 * Format a CallersResult as a JSON string conforming to the CallersResult schema.
 *
 * @param result     The callers result to format.
 * @param metricsById Optional map of symbol ID → metrics for resolving display names and scores.
 * @returns Prettified JSON string.
 */
export function formatImpactTreeJson(
  result: CallersResult,
  metricsById: ReadonlyMap<string, SymbolMetrics> = new Map(),
): string {
  const output = {
    symbol: result.symbol,
    file: result.file,
    riskLevel: result.riskLevel,
    metrics: {
      f: result.metrics.f,
      cc: result.metrics.cc,
      t: result.metrics.t,
      r: result.metrics.r,
      crap: result.metrics.crap,
    },
    impactSummary: result.impactSummary,
    callerTree: result.callerTree.map((n) => toJsonNode(n, metricsById)),
  };
  return JSON.stringify(output, null, 2);
}

function toJsonNode(
  node: CallerNode,
  metricsById: ReadonlyMap<string, SymbolMetrics>,
): JsonCallerNode {
  const metrics = metricsById.get(node.id);
  return {
    id: node.id,
    name: metrics?.name ?? node.id,
    depth: node.depth,
    recursive: node.recursive,
    metrics: metrics
      ? { f: metrics.f, cc: metrics.cc, t: metrics.t, r: metrics.r, crap: metrics.crap }
      : null,
    children: node.children.map((c) => toJsonNode(c, metricsById)),
  };
}
