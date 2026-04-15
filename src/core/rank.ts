/**
 * Rank (R) propagation: each unit starts at 1; callers add R_caller / outDegree(caller) to each callee.
 * Iterated until convergence (Dependable Dependencies paper, PageRank-like without damping).
 */

export type CallEdge = { readonly caller: string; readonly callee: string };

export type RankOptions = {
  readonly maxIterations: number;
  readonly epsilon: number;
};

const defaultOptions: RankOptions = {
  maxIterations: 100,
  epsilon: 1e-6,
};

/** Build outgoing adjacency: caller -> set of callees (unique). */
export function calleesByCaller(edges: readonly CallEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of edges) {
    let set = map.get(e.caller);
    if (!set) {
      set = new Set();
      map.set(e.caller, set);
    }
    set.add(e.callee);
  }
  return map;
}

export function allNodeIds(edges: readonly CallEdge[]): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.caller);
    ids.add(e.callee);
  }
  return ids;
}

/**
 * One synchronous update: R_new(v) = 1 + sum_{u calls v} R_old(u) / outDegree(u).
 * Callers with outDegree 0 contribute nothing (they do not depend on any callee in the graph).
 */
export function rankOneStep(
  nodeIds: ReadonlySet<string>,
  outDegree: ReadonlyMap<string, number>,
  incomingContributions: ReadonlyMap<string, readonly { caller: string }[]>,
  rOld: ReadonlyMap<string, number>
): Map<string, number> {
  const next = new Map<string, number>();
  for (const id of nodeIds) {
    let sum = 0;
    const incoming = incomingContributions.get(id);
    if (incoming) {
      for (const { caller } of incoming) {
        const deg = outDegree.get(caller) ?? 0;
        if (deg > 0) {
          sum += (rOld.get(caller) ?? 1) / deg;
        }
      }
    }
    next.set(id, 1 + sum);
  }
  return next;
}

export function buildIncomingMap(edges: readonly CallEdge[]): Map<string, { caller: string }[]> {
  const callees = calleesByCaller(edges);
  const incoming = new Map<string, { caller: string }[]>();
  for (const [caller, calleesSet] of callees) {
    for (const callee of calleesSet) {
      let list = incoming.get(callee);
      if (!list) {
        list = [];
        incoming.set(callee, list);
      }
      list.push({ caller });
    }
  }
  return incoming;
}

export function outDegreesFromCallees(callees: ReadonlyMap<string, Set<string>>): Map<string, number> {
  const deg = new Map<string, number>();
  for (const [caller, set] of callees) {
    deg.set(caller, set.size);
  }
  return deg;
}

export function computeRanks(edges: readonly CallEdge[], options: Partial<RankOptions> = {}): Map<string, number> {
  const opts = { ...defaultOptions, ...options };
  const nodeIds = allNodeIds(edges);
  if (nodeIds.size === 0) {
    return new Map();
  }
  const callees = calleesByCaller(edges);
  const outDeg = outDegreesFromCallees(callees);
  const incoming = buildIncomingMap(edges);

  let r = new Map<string, number>();
  for (const id of nodeIds) {
    r.set(id, 1);
  }

  for (let i = 0; i < opts.maxIterations; i++) {
    const rNext = rankOneStep(nodeIds, outDeg, incoming, r);
    let maxDelta = 0;
    for (const id of nodeIds) {
      const a = r.get(id) ?? 1;
      const b = rNext.get(id) ?? 1;
      maxDelta = Math.max(maxDelta, Math.abs(a - b));
    }
    r = rNext;
    if (maxDelta < opts.epsilon) {
      break;
    }
  }
  return r;
}
