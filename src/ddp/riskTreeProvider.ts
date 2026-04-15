import * as vscode from "vscode";
import type { SymbolMetrics } from "../core/analyze";
import { sortSymbolsByFDescending, symbolsForFile } from "../core/viewModel";
import type { ExtensionState } from "./extensionState";

type RiskNode =
  | { type: "file"; uri: string; label: string }
  | { type: "symbol"; symbol: SymbolMetrics }
  | { type: "empty"; message: string };

export class RiskTreeProvider implements vscode.TreeDataProvider<RiskNode> {
  private _onDidChange = new vscode.EventEmitter<RiskNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly state: ExtensionState) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: RiskNode): vscode.TreeItem {
    if (element.type === "empty") {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (element.type === "file") {
      const maxF = Math.max(
        0,
        ...symbolsForFile(element.uri, this.state.lastAnalysis?.symbols ?? []).map((s) => s.f)
      );
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `max F≈${maxF.toFixed(0)}`;
      item.iconPath = new vscode.ThemeIcon("file-code");
      item.contextValue = "ddpFile";
      return item;
    }
    const s = element.symbol;
    const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
    item.description = `F=${s.f.toFixed(1)}  R=${s.r.toFixed(2)}  CC=${s.cc}  T=${(s.t * 100).toFixed(0)}%`;
    item.tooltip = new vscode.MarkdownString(
      `**${s.name}**\n\nR=${s.r.toFixed(3)}  CRAP=${s.crap.toFixed(2)}  F=${s.f.toFixed(2)}`
    );
      item.command = {
        command: "ddp.revealSymbol",
        title: "Reveal symbol",
        arguments: [s.id],
      };
      return item;
  }

  async getChildren(element?: RiskNode): Promise<RiskNode[]> {
    const analysis = this.state.lastAnalysis;
    if (!analysis?.symbols.length) {
      return element ? [] : [{ type: "empty" as const, message: "Run “DDP: Analyze workspace” (or Refresh)" }];
    }
    if (!element) {
      const byFile = new Map<string, SymbolMetrics[]>();
      for (const s of analysis.symbols) {
        let list = byFile.get(s.uri);
        if (!list) {
          list = [];
          byFile.set(s.uri, list);
        }
        list.push(s);
      }
      const files = [...byFile.entries()].sort((a, b) => {
        const maxA = Math.max(...a[1].map((x) => x.f));
        const maxB = Math.max(...b[1].map((x) => x.f));
        return maxB - maxA;
      });
      return files.map(([uri]) => ({
        type: "file" as const,
        uri,
        label: vscode.Uri.parse(uri).fsPath.split(/[/\\]/).pop() ?? uri,
      }));
    }
    if (element.type === "file") {
      const list = sortSymbolsByFDescending(symbolsForFile(element.uri, analysis.symbols));
      return list.map((symbol) => ({ type: "symbol" as const, symbol }));
    }
    return [];
  }
}
