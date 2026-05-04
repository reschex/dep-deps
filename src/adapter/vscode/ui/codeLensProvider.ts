import * as vscode from "vscode";
import type { SymbolProvider } from "../../../core/ports";
import { formatCodeLensTitle } from "../../../core/viewModel";
import type { ExtensionState } from "../extensionState";
import type { DdpConfiguration } from "../configuration";

export class DdpCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(
    private readonly state: ExtensionState,
    private readonly getConfig: () => DdpConfiguration,
    private readonly symbolProvider: SymbolProvider,
  ) {}

  invalidate(): void {
    this._onDidChange.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!this.getConfig().codelensEnabled) {
      return [];
    }
    const byId = this.state.symbolById;
    if (!byId.size) {
      return [];
    }
    const functions = await this.symbolProvider.getFunctionSymbols(document.uri.toString());
    const lenses: vscode.CodeLens[] = [];
    for (const fn of functions) {
      // Build ID the same way makeSymbolId does in analysisOrchestrator:
      // `${uri}#${selectionStartLine}:${selectionStartCharacter}` — declaration-start position
      // from NativeSymbolProvider (node.getStart), not LSP selectionRange (name position).
      const id = `${document.uri.toString()}#${fn.selectionStartLine}:${fn.selectionStartCharacter}`;
      const m = byId.get(id);
      if (!m) {
        continue;
      }
      const range = new vscode.Range(
        new vscode.Position(fn.selectionStartLine, fn.selectionStartCharacter),
        new vscode.Position(fn.selectionStartLine, fn.selectionStartCharacter),
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: formatCodeLensTitle(m),
          tooltip: `R=${m.r.toFixed(3)} CRAP=${m.crap.toFixed(2)} CC=${m.cc} T=${(m.t * 100).toFixed(0)}%`,
          command: "ddp.revealSymbol",
          arguments: [id],
        })
      );
    }
    return lenses;
  }
}
