import type { CallEdge } from "./rank";

/** One caller and its callees (e.g. from LSP outgoing calls). */
export type CallerCallees = {
  readonly callerId: string;
  readonly calleeIds: readonly string[];
};

/**
 * Convert caller-callee groups into flat call edges, filtering self-edges.
 *
 * @param rows Each row represents one caller and its outgoing callees.
 * @returns Flat list of { caller, callee } edges with self-edges removed.
 */
export function edgesFromCallerCallees(rows: readonly CallerCallees[]): CallEdge[] {
  const edges: CallEdge[] = [];
  for (const row of rows) {
    for (const callee of row.calleeIds) {
      if (callee !== row.callerId) {
        edges.push({ caller: row.callerId, callee });
      }
    }
  }
  return edges;
}
