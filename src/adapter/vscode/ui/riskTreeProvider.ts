import * as vscode from "vscode";
import type { SymbolMetrics } from "../../../core/analyze";
import { sortSymbols, type SortField, symbolsForFile } from "../../../core/viewModel";
import type { ExtensionState } from "../extensionState";
import type { IntegrationEntry, IntegrationStatus } from "../../../core/integrationReport";

const SORT_FIELD_LABELS: Record<SortField, string> = { f: "F", fPrime: "F′", g: "G", cc: "CC", crap: "CRAP" };

export type RiskNode =
  | { type: "file"; uri: string; label: string }
  | { type: "symbol"; symbol: SymbolMetrics }
  | { type: "empty"; message: string }
  | { type: "scope"; label: string }
  | { type: "integrations" }
  | { type: "integration"; entry: IntegrationEntry };

export class RiskTreeProvider implements vscode.TreeDataProvider<RiskNode> {
  private readonly _onDidChange = new vscode.EventEmitter<RiskNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private _sortField: SortField = "f";

  constructor(private readonly state: ExtensionState) {}

  setSortField(field: SortField): void {
    this._sortField = field;
    this._onDidChange.fire();
  }

  get sortField(): SortField {
    return this._sortField;
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: RiskNode): vscode.TreeItem {
    if (element.type === "empty") {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (element.type === "scope") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("root-folder");
      item.contextValue = "ddpScope";
      return item;
    }
    if (element.type === "integrations") {
      const item = new vscode.TreeItem("Integrations", vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon("tools");
      item.contextValue = "ddpIntegrations";
      return item;
    }
    if (element.type === "integration") {
      return buildIntegrationItem(element.entry);
    }
    if (element.type === "file") {
      const field = this._sortField;
      const label = SORT_FIELD_LABELS[field];
      const maxVal = Math.max(
        0,
        ...symbolsForFile(element.uri, this.state.lastAnalysis?.symbols ?? []).map((s) => s[field])
      );
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `max ${label}≈${maxVal.toFixed(0)}`;
      item.iconPath = new vscode.ThemeIcon("file-code");
      item.contextValue = "ddpFile";
      item.command = {
        command: "ddp.riskView.openFile",
        title: "Open file",
        arguments: [vscode.Uri.parse(element.uri)],
      };
      return item;
    }
    return buildSymbolItem(element.symbol);
  }

  async getChildren(element?: RiskNode): Promise<RiskNode[]> {
    const analysis = this.state.lastAnalysis;
    if (!analysis?.symbols.length) {
      return element ? [] : [{ type: "empty" as const, message: "Run “DDP: Analyze workspace” (or Refresh)" }];
    }
    if (!element) {
      const rootUri = this.state.lastScope?.rootUri;
      const scopeLabel = rootUri
        ? vscode.Uri.parse(rootUri).fsPath
        : "workspace";
      const header: RiskNode[] = [{ type: "scope" as const, label: scopeLabel }];
      if (analysis.integrations?.entries.length) {
        header.push({ type: "integrations" as const });
      }
      return [
        ...header,
        ...buildFileNodes(analysis.symbols, this._sortField),
      ];
    }
    if (element.type === "integrations") {
      const entries = analysis.integrations?.entries ?? [];
      return entries.map((entry) => ({ type: "integration" as const, entry }));
    }
    if (element.type === "file") {
      const list = sortSymbols(symbolsForFile(element.uri, analysis.symbols), this._sortField);
      return list.map((symbol) => ({ type: "symbol" as const, symbol }));
    }
    return [];
  }
}

/**
 * Group symbols by their owning file URI, then return file nodes ordered by
 * the highest value of `field` within each file (descending — riskiest files
 * first).
 */
function buildFileNodes(symbols: readonly SymbolMetrics[], field: SortField): RiskNode[] {
  const byFile = new Map<string, SymbolMetrics[]>();
  for (const s of symbols) {
    let list = byFile.get(s.uri);
    if (!list) {
      list = [];
      byFile.set(s.uri, list);
    }
    list.push(s);
  }
  const sortedEntries = [...byFile.entries()].sort((a, b) => {
    const maxA = Math.max(...a[1].map((x) => x[field]));
    const maxB = Math.max(...b[1].map((x) => x[field]));
    return maxB - maxA;
  });
  return sortedEntries.map(([uri]) => ({
    type: "file" as const,
    uri,
    label: vscode.Uri.parse(uri).fsPath.split(/[/\\]/).pop() ?? uri,
  }));
}

const STATUS_ICON: Record<IntegrationStatus, string> = {
  active: "pass",
  fallback: "warning",
  inactive: "circle-slash",
};

/** Build a leaf TreeItem for an integration source row. */
function buildIntegrationItem(entry: IntegrationEntry): vscode.TreeItem {
  const item = new vscode.TreeItem(
    `${entry.category} · ${entry.source}`,
    vscode.TreeItemCollapsibleState.None,
  );
  item.description = entry.detail;
  item.iconPath = new vscode.ThemeIcon(STATUS_ICON[entry.status]);
  item.contextValue = "ddpIntegration";
  if (entry.tooltip) {
    item.tooltip = new vscode.MarkdownString(entry.tooltip);
  }
  if (entry.settingsKey) {
    item.command = {
      command: "workbench.action.openSettings",
      title: "Open Settings",
      arguments: [entry.settingsKey],
    };
  }
  return item;
}

/** Build a leaf TreeItem representing a single ranked symbol. */
function buildSymbolItem(symbol: SymbolMetrics): vscode.TreeItem {
  const item = new vscode.TreeItem(symbol.name, vscode.TreeItemCollapsibleState.None);
  item.description = `F=${symbol.f.toFixed(1)}  R=${symbol.r.toFixed(2)}  CC=${symbol.cc}  T=${(symbol.t * 100).toFixed(0)}%`;
  item.tooltip = new vscode.MarkdownString(
    `**${symbol.name}**\n\nR=${symbol.r.toFixed(3)}  CRAP=${symbol.crap.toFixed(2)}  F=${symbol.f.toFixed(2)}`,
  );
  item.contextValue = "ddpSymbol";
  item.command = {
    command: "ddp.revealSymbol",
    title: "Reveal symbol",
    arguments: [symbol.id],
  };
  return item;
}
