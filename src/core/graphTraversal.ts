import type { CallEdge } from "./rank";

export type EdgeIndex = {
  readonly callersByCallee: ReadonlyMap<string, readonly string[]>;
};

export function indexEdges(edges: ReadonlyArray<CallEdge>): EdgeIndex {
  const callersByCallee = new Map<string, string[]>();
  for (const edge of edges) {
    let callers = callersByCallee.get(edge.callee);
    if (!callers) {
      callers = [];
      callersByCallee.set(edge.callee, callers);
    }
    callers.push(edge.caller);
  }
  return { callersByCallee };
}

export type CallerTree = {
  readonly symbolId: string;
  readonly callers: ReadonlyArray<CallerTree>;
  readonly depth: number;
  readonly isRecursive: boolean;
};

export function buildCallerTree(
  symbolId: string,
  index: EdgeIndex,
  maxDepth: number
): CallerTree {
  function build(id: string, depth: number, ancestors: Set<string>): CallerTree {
    const isRecursive = ancestors.has(id);
    if (isRecursive || depth >= maxDepth) {
      return { symbolId: id, callers: [], depth, isRecursive };
    }
    const callerIds = index.callersByCallee.get(id) ?? [];
    const newAncestors = new Set(ancestors);
    newAncestors.add(id);
    const callers = callerIds.map((callerId) =>
      build(callerId, depth + 1, newAncestors)
    );
    return { symbolId: id, callers, depth, isRecursive: false };
  }
  return build(symbolId, 0, new Set());
}
