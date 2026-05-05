import * as vscode from "vscode";
import type { ExtensionState } from "../extensionState";
import { callerTree, impactSummary, directCallersOf, type CallerNode } from "../../../core/callerTree";

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
    const allAffectedIds = collectAllIds(tree);
    const combinedF = allAffectedIds.reduce((sum, id) => {
      const metrics = this.state.symbolById.get(id);
      return sum + (metrics?.f ?? 0);
    }, 0);
    return { ...summary, combinedF };
  }

  getTreeItem(element: ImpactTreeNode): vscode.TreeItem {
    if (element.type === "empty") {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }

    const metrics = this.state.symbolById.get(element.symbolId);
    const name = metrics?.name ?? labelFromSymbolId(element.symbolId);
    const fStr = metrics ? `F=${metrics.f.toFixed(1)}` : "F=?";
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
      const ancestors = new Set([this._rootSymbolId]);
      return callerIds.map((callerId) => ({
        type: "caller" as const,
        symbolId: callerId,
        depth: 1,
        recursive: ancestors.has(callerId),
        ancestors,
      }));
    }

    // Expanding a caller node: get its callers (lazy load)
    if (element.type === "caller") {
      if (element.recursive || element.depth >= this._maxDepth) {
        return [];
      }
      const callerIds = directCallersOf(element.symbolId, analysis.edges);
      const newAncestors = new Set([...element.ancestors, element.symbolId]);
      return callerIds.map((callerId) => ({
        type: "caller" as const,
        symbolId: callerId,
        depth: element.depth + 1,
        recursive: newAncestors.has(callerId),
        ancestors: newAncestors,
      }));
    }

    return [];
  }
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
