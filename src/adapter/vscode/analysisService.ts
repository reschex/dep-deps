/**
 * VS Code facade for analysis — constructs adapters and delegates to AnalysisOrchestrator.
 *
 * This is the only module that bridges VS Code APIs with the domain orchestrator.
 * All domain logic lives in analysisOrchestrator.ts (infrastructure-agnostic).
 */

import * as vscode from "vscode";
import { AnalysisOrchestrator, type AnalysisResult } from "./analysisOrchestrator";
import { buildConfiguration, type AnalysisScope } from "./configuration";
import { CcProviderRegistry } from "../../core/ccRegistry";
import { CoverageStore } from "./coverageStore";
import {
  VsCodeDocumentProvider,
  VsCodeCallGraphProvider,
  VsCodeCoverageProvider,
  HybridCallGraphProvider,
  EslintCcProvider,
  RadonCcProvider,
  PmdCcProvider,
  VsCodeLogger,
} from "./adapters";
import { NativeSymbolProvider } from "../../language/nativeSymbolProvider";
import { NativeCallGraphProvider } from "../../language/nativeCallGraphProvider";
import { GitChurnAdapter } from "./churn/gitChurnAdapter";
import { loadGitignoreFilter, makeUriFilter, type UriFilter } from "../../core/gitignoreFilter";

export type { AnalysisResult } from "./analysisOrchestrator";

export class AnalysisService {
  readonly coverageStore = new CoverageStore();
  private readonly logger: VsCodeLogger;

  constructor() {
    const channel = vscode.window.createOutputChannel("DDP Risk");
    this.logger = new VsCodeLogger(channel);
  }

  async analyze(token: vscode.CancellationToken, scope?: AnalysisScope): Promise<AnalysisResult | undefined> {
    const rawConfig = vscode.workspace.getConfiguration("ddp");
    const config = buildConfiguration(<T>(key: string, def: T) => rawConfig.get<T>(key, def));

    const ccRegistry = new CcProviderRegistry();
    if (config.cc.useEslintForTsJs) {
      ccRegistry.register({
        supportedLanguages: ["typescript", "javascript", "typescriptreact", "javascriptreact"],
        provider: new EslintCcProvider(config.cc.eslintPath),
      });
    }
    ccRegistry.register({
      supportedLanguages: ["python"],
      provider: new RadonCcProvider(config.cc.pythonPath),
    });
    ccRegistry.register({
      supportedLanguages: ["java"],
      provider: new PmdCcProvider(config.cc.pmdPath),
    });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceRootUri = workspaceFolder?.uri.toString();
    const churnProvider = config.churn.enabled && workspaceRootUri
      ? new GitChurnAdapter(workspaceRootUri)
      : undefined;

    let gitignoreFilter: UriFilter | undefined;
    if (config.fileFilter.respectGitignore && workspaceFolder) {
      const rawFilter = await loadGitignoreFilter(workspaceFolder.uri.fsPath);
      gitignoreFilter = makeUriFilter(workspaceFolder.uri.toString(), rawFilter);
    }

    const lspCallGraph = new VsCodeCallGraphProvider(token, config.excludeTests, config.debugEnabled ? this.logger : undefined, gitignoreFilter);
    const logger = config.debugEnabled ? this.logger : undefined;
    const callGraphProvider = workspaceFolder
      ? new HybridCallGraphProvider(lspCallGraph, new NativeCallGraphProvider(workspaceFolder.uri.fsPath), logger)
      : lspCallGraph;

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: new VsCodeDocumentProvider(config.excludeTests),
      symbolProvider: new NativeSymbolProvider({ pythonPath: config.cc.pythonPath, pmdPath: config.cc.pmdPath }),
      callGraphProvider,
      coverageProvider: new VsCodeCoverageProvider(this.coverageStore, config.coverage.lcovGlob, config.coverage.jacocoGlob, token),
      ccRegistry,
      logger: this.logger,
      churnProvider,
      gitignoreFilter,
    });

    // Default scope to workspace root when no explicit scope is provided.
    // This makes workspace analysis behave identically to folder analysis
    // scoped to the project root, and ensures the log shows the actual path.
    const effectiveScope = scope ?? (workspaceRootUri ? { rootUri: workspaceRootUri } : undefined);

    return orchestrator.analyze(config, { isCancelled: () => token.isCancellationRequested }, effectiveScope);
  }
}
