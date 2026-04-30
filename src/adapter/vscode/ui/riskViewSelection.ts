import type { RiskNode } from "./riskTreeProvider";

/**
 * Handles a selection change in the risk view tree.
 * Calls onSymbolSelected with the id of the first selected symbol node.
 * No-ops for file, scope, or empty node selections.
 */
export function handleRiskViewSelection(
  selection: readonly RiskNode[],
  onSymbolSelected: (symbolId: string) => void
): void {
  const symbolNode = selection.find((n) => n.type === "symbol");
  if (symbolNode && symbolNode.type === "symbol") {
    onSymbolSelected(symbolNode.symbol.id);
  }
}
