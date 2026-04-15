/**
 * Manages the analyze-and-update-UI workflow.
 *
 * Encapsulates the debounce flag, progress reporting, analysis execution,
 * and UI refresh — extracted from register.ts to separate concerns.
 */

import * as vscode from "vscode";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";
import type { ExtensionState } from "./extensionState";

export type UiRefreshable = {
  refreshTree(): void;
  invalidateCodeLens(): void;
  applyDecorations(): void;
};

export class AnalyzeCommand {
  private analyzing = false;

  constructor(
    private readonly runAnalysis: (token: vscode.CancellationToken, scope?: AnalysisScope) => Promise<AnalysisResult | undefined>,
    private readonly state: ExtensionState,
    private readonly ui: UiRefreshable
  ) {}

  async execute(scope?: AnalysisScope): Promise<void> {
    if (this.analyzing) {
      return;
    }
    this.analyzing = true;
    const title = scope
      ? `DDP: analyzing folder\u2026`
      : "DDP: analyzing workspace\u2026";
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable: true,
        },
        async (_progress, token) => {
          const result = await this.runAnalysis(token, scope);
          if (result) {
            this.state.setAnalysis(result);
          }
          this.ui.refreshTree();
          this.ui.invalidateCodeLens();
          this.ui.applyDecorations();
          void vscode.commands.executeCommand("editor.action.refreshCodeLens");
        }
      );
    } finally {
      this.analyzing = false;
    }
  }
}
