import type { CallEdge } from "./rank";
import type { SymbolMetrics } from "./analyze";

/** A node in the caller tree with depth and recursion detection. */
export type CallerNode = {
  readonly id: string;
  readonly depth: number;
  readonly recursive: boolean;
  readonly children: CallerNode[];
};

/** Return the IDs of symbols that directly call the given symbol. */
export function directCallersOf(symbolId: string, edges: readonly CallEdge[]): string[] {
  return edges.filter((e) => e.callee === symbolId).map((e) => e.caller);
}

/**
 * Build a caller tree rooted at `symbolId`, expanding callers up to `maxDepth`.
 * Detects cycles and marks recursive nodes.
 */
export function callerTree(symbolId: string, edges: readonly CallEdge[], maxDepth: number): CallerNode[] {
  const callerIndex = buildCallerIndex(edges);
  return expand(symbolId, 1, maxDepth, new Set([symbolId]), callerIndex);
}

function buildCallerIndex(edges: readonly CallEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const e of edges) {
    let list = index.get(e.callee);
    if (!list) {
      list = [];
      index.set(e.callee, list);
    }
    list.push(e.caller);
  }
  return index;
}

function expand(
  symbolId: string,
  depth: number,
  maxDepth: number,
  visited: Set<string>,
  callerIndex: Map<string, string[]>
): CallerNode[] {
  const callers = callerIndex.get(symbolId) ?? [];
  return callers.map((callerId) => {
    if (visited.has(callerId)) {
      return { id: callerId, depth, recursive: true, children: [] };
    }
    const children =
      depth < maxDepth
        ? expand(callerId, depth + 1, maxDepth, new Set([...visited, callerId]), callerIndex)
        : [];
    return { id: callerId, depth, recursive: false, children };
  });
}

/** Summary statistics for an impact tree. */
export type ImpactSummary = {
  readonly directCallers: number;
  readonly totalAffected: number;
};

/** Compute summary statistics from a caller tree. */
export function impactSummary(tree: readonly CallerNode[]): ImpactSummary {
  return {
    directCallers: tree.length,
    totalAffected: countNodes(tree),
  };
}

function countNodes(nodes: readonly CallerNode[], seen = new Set<string>()): number {
  let count = 0;
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      count += 1 + countNodes(node.children, seen);
    }
  }
  return count;
}

/** A flattened item for display (e.g. in a QuickPick). */
export type ImpactItem = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

/**
 * Flatten a caller tree into display items with indentation and metrics.
 * Nodes without metrics show "F=?" as a fallback.
 */
export function flattenTree(
  tree: readonly CallerNode[],
  metricsById: ReadonlyMap<string, SymbolMetrics>
): ImpactItem[] {
  const items: ImpactItem[] = [];
  flattenInto(tree, metricsById, items);
  return items;
}

function flattenInto(
  nodes: readonly CallerNode[],
  metricsById: ReadonlyMap<string, SymbolMetrics>,
  out: ImpactItem[]
): void {
  for (const node of nodes) {
    const metrics = metricsById.get(node.id);
    const name = metrics?.name ?? node.id;
    const fStr = metrics ? `F=${metrics.f.toFixed(1)}` : "F=?";
    const recursiveTag = node.recursive ? " \u{1F504} RECURSIVE" : "";
    const indent = node.depth > 1 ? "$(indent)".repeat(node.depth - 1) : "";
    out.push({
      id: node.id,
      label: `${indent}${name}`,
      description: `${fStr} (depth ${node.depth})${recursiveTag}`,
    });
    flattenInto(node.children, metricsById, out);
  }
}
