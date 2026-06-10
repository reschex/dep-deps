/**
 * VS Code facade for analysis — constructs adapters and delegates to AnalysisOrchestrator.
 *
 * This is the only module that bridges VS Code APIs with the domain orchestrator.
 * All domain logic lives in analysisOrchestrator.ts (infrastructure-agnostic).
 */

import * as vscode from "vscode";
import { AnalysisOrchestrator, type AnalysisResult } from "./analysisOrchestrator";
import { buildConfiguration, mergeConfigWithFileConfig, type AnalysisScope, type DdpConfiguration } from "./configuration";
import { loadDdpConfig } from "../../core/config";
import { CcProviderRegistry } from "../../core/ccRegistry";
import { registerCcProviders } from "../../core/registerCcProviders";
import type { CallGraphProvider } from "../../core/ports";
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

/**
 * Build the URI filter that excludes .gitignore-matched files, or undefined
 * when the feature is disabled or there is no workspace folder to anchor
 * the gitignore lookup against.
 */
async function resolveGitignoreFilter(
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  respectGitignore: boolean,
): Promise<UriFilter | undefined> {
  if (!respectGitignore || !workspaceFolder) return undefined;
  const rawFilter = await loadGitignoreFilter(workspaceFolder.uri.fsPath);
  return makeUriFilter(workspaceFolder.uri.toString(), rawFilter);
}

/**
 * Build a CC provider registry wired to the per-language adapters
 * (ESLint, Radon, PMD), parameterised by the resolved configuration.
 */
function buildCcRegistry(config: DdpConfiguration): CcProviderRegistry {
  const ccRegistry = new CcProviderRegistry();
  registerCcProviders(ccRegistry, config, {
    eslint: () => new EslintCcProvider(config.cc.eslintPath),
    radon: () => new RadonCcProvider(config.cc.pythonPath),
    pmd: () => new PmdCcProvider(config.cc.pmdPath),
  });
  return ccRegistry;
}

export class AnalysisService {
  readonly coverageStore = new CoverageStore();
  private readonly logger: VsCodeLogger;

  constructor() {
    const channel = vscode.window.createOutputChannel("DDP Risk");
    this.logger = new VsCodeLogger(channel);
  }

  /**
   * Layer configuration sources: `.ddprc.json` > VS Code settings > built-in defaults.
   *
   * Falls back to pure VS Code configuration when no workspace folder is open
   * or when `.ddprc.json` is absent/invalid — preserving any non-default VS Code
   * settings the user has set (e.g. churn.enabled, cc.eslintPath).
   * Only applies `.ddprc.json` merge when the file is actually present and valid.
   */
  private async resolveConfig(
    rawConfig: vscode.WorkspaceConfiguration,
    workspaceFsPath: string | undefined,
  ): Promise<DdpConfiguration> {
    const vsCodeConfig = buildConfiguration(<T>(key: string, def: T) => rawConfig.get<T>(key, def));
    if (!workspaceFsPath) return vsCodeConfig;

    const fileConfig = await loadDdpConfig(workspaceFsPath, (msg) => this.logger.info(msg));
    if (!fileConfig) return vsCodeConfig;
    return mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
  }

  /**
   * Build the call-graph provider chain. Returns a HybridCallGraphProvider
   * that prefers VS Code LSP and falls back to the native provider when a
   * workspace folder is available; falls back to LSP-only otherwise.
   */
  private buildCallGraphProvider(
    token: vscode.CancellationToken,
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    gitignoreFilter: UriFilter | undefined,
    debugEnabled: boolean,
  ): CallGraphProvider {
    const debugLogger = debugEnabled ? this.logger : undefined;
    const lspCallGraph = new VsCodeCallGraphProvider(token, debugLogger, gitignoreFilter);
    if (!workspaceFolder) return lspCallGraph;
    return new HybridCallGraphProvider(
      lspCallGraph,
      new NativeCallGraphProvider(workspaceFolder.uri.fsPath),
      debugLogger,
    );
  }

  async analyze(token: vscode.CancellationToken, scope?: AnalysisScope): Promise<AnalysisResult | undefined> {
    const rawConfig = vscode.workspace.getConfiguration("ddp");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const config = await this.resolveConfig(rawConfig, workspaceFolder?.uri.fsPath);

    const ccRegistry = buildCcRegistry(config);

    const workspaceRootUri = workspaceFolder?.uri.toString();
    const churnProvider = config.churn.enabled && workspaceRootUri
      ? new GitChurnAdapter(workspaceRootUri)
      : undefined;

    const gitignoreFilter = await resolveGitignoreFilter(workspaceFolder, config.fileFilter.respectGitignore);

    const callGraphProvider = this.buildCallGraphProvider(token, workspaceFolder, gitignoreFilter, config.debugEnabled);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: new VsCodeDocumentProvider(),
      symbolProvider: new NativeSymbolProvider({ pythonPath: config.cc.pythonPath }),
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
