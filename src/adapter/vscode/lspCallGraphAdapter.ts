import type { CallEdge } from "../../core/rank";
import { edgesFromCallerCallees } from "../../core/graphBuilder";

/** Abstraction over VS Code's call hierarchy so orchestration can be tested with fakes. */
export interface CallHierarchyAdapter {
  /** Return all function-level symbols across the workspace as {id, uriStr}. */
  findFunctionSymbols(): Promise<{ id: string; uriStr: string }[]>;
  /** Given a symbol id, return the ids of all callees (outgoing calls). */
  getOutgoingCalleeIds(symbolId: string): Promise<string[]>;
  /** Whether the operation has been cancelled. */
  isCancelled(): boolean;
}

/**
 * Pure orchestration: iterate symbols, collect outgoing edges, build CallEdge[].
 * Self-edges (caller === callee) are filtered. Dedup delegated to edgesFromCallerCallees.
 */
export async function collectCallEdgesViaAdapter(
  adapter: CallHierarchyAdapter
): Promise<CallEdge[]> {
  const symbols = await adapter.findFunctionSymbols();
  const callerCallees: { callerId: string; calleeIds: string[] }[] = [];

  for (const sym of symbols) {
    if (adapter.isCancelled()) {
      break;
    }
    const calleeIds = await adapter.getOutgoingCalleeIds(sym.id);
    const filtered = calleeIds.filter((id) => id !== sym.id);
    if (filtered.length) {
      callerCallees.push({ callerId: sym.id, calleeIds: filtered });
    }
  }

  return edgesFromCallerCallees(callerCallees);
}
