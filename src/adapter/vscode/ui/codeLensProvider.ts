import * as vscode from "vscode";
import { getFlatFunctionSymbols } from "../documentSymbols";
import { symbolIdFromUriRange } from "../symbolId";
import { formatCodeLensTitle } from "../../../core/viewModel";
import type { ExtensionState } from "../extensionState";
import type { DdpConfiguration } from "../configuration";

export class DdpCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(
    private readonly state: ExtensionState,
    private readonly getConfig: () => DdpConfiguration
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
    const functions = await getFlatFunctionSymbols(document.uri);
    const lenses: vscode.CodeLens[] = [];
    for (const fn of functions) {
      const id = symbolIdFromUriRange(document.uri, fn.selectionRange);
      const m = byId.get(id);
      if (!m) {
        continue;
      }
      const range = fn.selectionRange;
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
