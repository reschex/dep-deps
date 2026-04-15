/**
 * VS Code facade for analysis — constructs adapters and delegates to AnalysisOrchestrator.
 *
 * This is the only module that bridges VS Code APIs with the domain orchestrator.
 * All domain logic lives in analysisOrchestrator.ts (infrastructure-agnostic).
 */

import * as vscode from "vscode";
import { AnalysisOrchestrator, type AnalysisResult } from "./analysisOrchestrator";
import { buildConfiguration, type AnalysisScope } from "./configuration";
import { CcProviderRegistry } from "../core/ccRegistry";
import { CoverageStore } from "./coverageStore";
import {
  VsCodeDocumentProvider,
  VsCodeSymbolProvider,
  VsCodeCallGraphProvider,
  VsCodeCoverageProvider,
  EslintCcProvider,
  RadonCcProvider,
  PmdCcProvider,
  VsCodeLogger,
} from "./adapters";

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

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: new VsCodeDocumentProvider(config.excludeTests),
      symbolProvider: new VsCodeSymbolProvider(),
      callGraphProvider: new VsCodeCallGraphProvider(token, config.excludeTests),
      coverageProvider: new VsCodeCoverageProvider(this.coverageStore, config.coverage.lcovGlob, token),
      ccRegistry,
      logger: this.logger,
    });

    return orchestrator.analyze(config, { isCancelled: () => token.isCancellationRequested }, scope);
  }
}
