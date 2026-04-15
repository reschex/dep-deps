import * as vscode from "vscode";
import { getFlatFunctionSymbols } from "./documentSymbols";
import { symbolIdFromUriRange } from "./symbolId";
import { formatHoverBreakdown } from "../core/viewModel";
import type { ExtensionState } from "./extensionState";

export class DdpHoverProvider implements vscode.HoverProvider {
  constructor(private readonly state: ExtensionState) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const byId = this.state.symbolById;
    if (!byId.size) {
      return undefined;
    }
    const functions = await getFlatFunctionSymbols(document.uri);
    for (const fn of functions) {
      if (!fn.selectionRange.contains(position) && !fn.range.contains(position)) {
        continue;
      }
      const id = symbolIdFromUriRange(document.uri, fn.selectionRange);
      const m = byId.get(id);
      if (!m) {
        return undefined;
      }
      const md = new vscode.MarkdownString(formatHoverBreakdown(m));
      md.isTrusted = true;
      return new vscode.Hover(md, fn.range);
    }
    return undefined;
  }
}
