import * as vscode from "vscode";
import type { SymbolProvider } from "../../../core/ports";
import { formatHoverBreakdown } from "../../../core/viewModel";
import type { ExtensionState } from "../extensionState";

export class DdpHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly state: ExtensionState,
    private readonly symbolProvider: SymbolProvider,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const byId = this.state.symbolById;
    if (!byId.size) {
      return undefined;
    }
    const functions = await this.symbolProvider.getFunctionSymbols(document.uri.toString());
    for (const fn of functions) {
      // Line-based containment: position must be within [selectionStartLine, bodyEndLine].
      // FunctionSymbolInfo does not expose bodyEndCharacter, so character-level precision
      // at the end of the closing line is not available — line-level is sufficient in practice.
      if (position.line < fn.selectionStartLine || position.line > fn.bodyEndLine) {
        continue;
      }
      // Build ID the same way makeSymbolId does in analysisOrchestrator:
      // `${uri}#${selectionStartLine}:${selectionStartCharacter}` — declaration-start position.
      const id = `${document.uri.toString()}#${fn.selectionStartLine}:${fn.selectionStartCharacter}`;
      const m = byId.get(id);
      if (!m) {
        continue;
      }
      const hoverRange = new vscode.Range(
        new vscode.Position(fn.selectionStartLine, fn.selectionStartCharacter),
        new vscode.Position(fn.bodyEndLine, 0),
      );
      const md = new vscode.MarkdownString(formatHoverBreakdown(m));
      md.isTrusted = true;
      return new vscode.Hover(md, hoverRange);
    }
    return undefined;
  }
}
