import * as vscode from "vscode";
import type { ExtensionState } from "../extensionState";
import { callerTree, impactSummary, directCallersOf, type CallerNode } from "../../../core/callerTree";
import { formatFLabel } from "../../../core/metricLabel";
import type { SymbolMetrics } from "../../../core/analyze";

const DEFAULT_MAX_DEPTH = 5;

export type ImpactTreeSummary = {
  readonly directCallers: number;
  readonly totalAffected: number;
  readonly combinedF: number;
};

function collectAllIds(nodes: readonly CallerNode[], seen = new Set<string>()): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      ids.push(node.id);
      ids.push(...collectAllIds(node.children, seen));
    }
  }
  return ids;
}

export type ImpactTreeNode =
  | { type: "empty"; message: string }
  | { type: "caller"; symbolId: string; depth: number; recursive: boolean; ancestors: ReadonlySet<string> };

export class ImpactTreeProvider implements vscode.TreeDataProvider<ImpactTreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<ImpactTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private _rootSymbolId: string | undefined;
  private _maxDepth = DEFAULT_MAX_DEPTH;

  constructor(private readonly state: ExtensionState) {}

  get rootSymbolId(): string | undefined {
    return this._rootSymbolId;
  }

  setRootSymbol(symbolId: string, maxDepth = DEFAULT_MAX_DEPTH): void {
    this._rootSymbolId = symbolId;
    this._maxDepth = maxDepth;
    this._onDidChange.fire();
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  /** Compute impact summary for the current root symbol. */
  getImpactSummary(): ImpactTreeSummary | undefined {
    if (!this._rootSymbolId) {
      return undefined;
    }
    const analysis = this.state.lastAnalysis;
    if (!analysis) {
      return undefined;
    }
    const tree = callerTree(this._rootSymbolId, analysis.edges, this._maxDepth);
    const summary = impactSummary(tree);
    const combinedF = combinedFOf(tree, this.state.symbolById);
    return { ...summary, combinedF };
  }

  getTreeItem(element: ImpactTreeNode): vscode.TreeItem {
    if (element.type === "empty") {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    return buildCallerItem(element, this.state.symbolById.get(element.symbolId));
  }

  async getChildren(element?: ImpactTreeNode): Promise<ImpactTreeNode[]> {
    if (!this._rootSymbolId) {
      return [{ type: "empty", message: "Select a symbol to view its impact tree" }];
    }

    const analysis = this.state.lastAnalysis;
    if (!analysis) {
      return [{ type: "empty", message: "No analysis results available" }];
    }

    // Top-level: get direct callers of root symbol
    if (!element) {
      const callerIds = directCallersOf(this._rootSymbolId, analysis.edges);
      if (callerIds.length === 0) {
        return [{ type: "empty", message: "No code depends on this symbol" }];
      }
      return buildCallerNodes(callerIds, 1, new Set([this._rootSymbolId]));
    }

    // Expanding a caller node: get its callers (lazy load)
    if (element.type === "caller") {
      if (element.recursive || element.depth >= this._maxDepth) {
        return [];
      }
      const callerIds = directCallersOf(element.symbolId, analysis.edges);
      const newAncestors = new Set([...element.ancestors, element.symbolId]);
      return buildCallerNodes(callerIds, element.depth + 1, newAncestors);
    }

    return [];
  }
}

/**
 * Sum the failure-risk (F) metric across every unique symbol in the impact
 * tree. Symbols missing from the metrics map contribute zero so the function
 * remains total over partially analysed trees.
 */
function combinedFOf(
  tree: readonly CallerNode[],
  symbolById: ReadonlyMap<string, SymbolMetrics>,
): number {
  return collectAllIds(tree).reduce(
    (sum, id) => sum + (symbolById.get(id)?.f ?? 0),
    0,
  );
}

/**
 * Build caller-type ImpactTreeNodes at a given depth, marking any caller
 * already in the ancestor set as recursive so the UI breaks the cycle.
 */
function buildCallerNodes(
  callerIds: readonly string[],
  depth: number,
  ancestors: ReadonlySet<string>,
): ImpactTreeNode[] {
  return callerIds.map((callerId) => ({
    type: "caller" as const,
    symbolId: callerId,
    depth,
    recursive: ancestors.has(callerId),
    ancestors,
  }));
}

/**
 * Build a TreeItem for a caller node in the impact tree. Recursive callers
 * render as collapsed leaves with a RECURSIVE marker; otherwise the node is
 * collapsible to lazy-load its own callers.
 */
function buildCallerItem(
  element: { symbolId: string; recursive: boolean },
  metrics: SymbolMetrics | undefined,
): vscode.TreeItem {
  const name = metrics?.name ?? labelFromSymbolId(element.symbolId);
  const fStr = formatFLabel(metrics);
  const fileLabel = metrics ? fileNameFromUri(metrics.uri) : "";
  const fileSuffix = fileLabel ? ` · ${fileLabel}` : "";
  const collapsible = element.recursive
    ? vscode.TreeItemCollapsibleState.None
    : vscode.TreeItemCollapsibleState.Collapsed;

  const item = new vscode.TreeItem(name, collapsible);
  item.description = element.recursive ? `${fStr}${fileSuffix} \u{1F504} RECURSIVE` : `${fStr}${fileSuffix}`;
  item.iconPath = new vscode.ThemeIcon(element.recursive ? "sync" : "symbol-function");
  item.contextValue = "ddpImpactCaller";
  item.command = { command: "ddp.revealSymbol", title: "Reveal symbol", arguments: [element.symbolId] };
  return item;
}

/** Extract the file name from a URI string (e.g. "file:///src/foo/bar.ts" → "bar.ts"). */
function fileNameFromUri(uri: string): string {
  const lastSlash = Math.max(uri.lastIndexOf("/"), uri.lastIndexOf("\\"));
  return lastSlash >= 0 ? uri.slice(lastSlash + 1) : uri;
}

/**
 * Extract a human-readable label from a symbol ID.
 * e.g. "file:///c%3A/src/foo.ts#42:4" → "foo.ts#42:4"
 * e.g. "unknown-id" → "unknown-id"
 */
function labelFromSymbolId(id: string): string {
  const hash = id.lastIndexOf("#");
  const uriPart = hash >= 0 ? id.slice(0, hash) : id;
  const locationPart = hash >= 0 ? id.slice(hash + 1) : "";
  const fileName = fileNameFromUri(uriPart);
  return locationPart ? `${fileName}#${locationPart}` : fileName;
}
