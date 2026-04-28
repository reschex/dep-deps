import * as vscode from "vscode";
import { decorationTier } from "../../../core/viewModel";
import type { ExtensionState } from "../extensionState";
import type { DecorationConfig } from "../configuration";

export class DecorationManager {
  private readonly warnDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 200, 0, 0.12)",
  });
  private readonly errorDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 80, 80, 0.15)",
  });

  constructor(
    private readonly state: ExtensionState,
    private readonly getDecoConfig: () => DecorationConfig
  ) {}

  dispose(): void {
    this.warnDeco.dispose();
    this.errorDeco.dispose();
  }

  applyActiveEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor?.document) {
      return;
    }
    const uri = editor.document.uri.toString();
    const analysis = this.state.lastAnalysis;
    const maxF = analysis?.fileRollup.get(uri);
    if (maxF === undefined) {
      editor.setDecorations(this.warnDeco, []);
      editor.setDecorations(this.errorDeco, []);
      return;
    }
    const decoConfig = this.getDecoConfig();
    const tier = decorationTier(maxF, decoConfig.warnThreshold, decoConfig.errorThreshold);
    const full = [fullDocumentRange(editor.document)];
    if (tier === "error") {
      editor.setDecorations(this.warnDeco, []);
      editor.setDecorations(this.errorDeco, full);
    } else if (tier === "warn") {
      editor.setDecorations(this.errorDeco, []);
      editor.setDecorations(this.warnDeco, full);
    } else {
      editor.setDecorations(this.warnDeco, []);
      editor.setDecorations(this.errorDeco, []);
    }
  }
}

function fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
  if (doc.lineCount === 0) {
    return new vscode.Range(0, 0, 0, 0);
  }
  const last = doc.lineCount - 1;
  return new vscode.Range(0, 0, last, doc.lineAt(last).text.length);
}
