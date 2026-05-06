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
 * Returns true when the user has explicitly set `key` at any scope
 * (user, workspace, or workspace-folder). Defaults / language-defaults
 * do not count — they leave the inspection record empty for the user-set
 * fields.
 */
function isExplicitlySet(rawConfig: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspection = rawConfig.inspect(key);
  return !!(inspection && (
    inspection.globalValue !== undefined ||
    inspection.workspaceValue !== undefined ||
    inspection.workspaceFolderValue !== undefined
  ));
}

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

export class AnalysisService {
  readonly coverageStore = new CoverageStore();
  private readonly logger: VsCodeLogger;

  constructor() {
    const channel = vscode.window.createOutputChannel("DDP Risk");
    this.logger = new VsCodeLogger(channel);
  }

  /**
   * Layer configuration sources: explicit VS Code settings > `.ddprc.json` > built-in defaults.
   *
   * Falls back to pure VS Code configuration when no workspace folder is open
   * (no place to look for `.ddprc.json`) or when the file is absent/invalid
   * (`loadDdpConfig` returns defaults — but we still merge so file config takes
   * precedence over VS Code defaults).
   */
  private async resolveConfig(
    rawConfig: vscode.WorkspaceConfiguration,
    workspaceFsPath: string | undefined,
  ): Promise<DdpConfiguration> {
    const vsCodeConfig = buildConfiguration(<T>(key: string, def: T) => rawConfig.get<T>(key, def));
    if (!workspaceFsPath) return vsCodeConfig;

    const fileConfig = await loadDdpConfig(workspaceFsPath, (msg) => this.logger.info(msg));
    return mergeConfigWithFileConfig(vsCodeConfig, fileConfig, (key) => isExplicitlySet(rawConfig, key));
  }

  async analyze(token: vscode.CancellationToken, scope?: AnalysisScope): Promise<AnalysisResult | undefined> {
    const rawConfig = vscode.workspace.getConfiguration("ddp");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const config = await this.resolveConfig(rawConfig, workspaceFolder?.uri.fsPath);

    const ccRegistry = new CcProviderRegistry();
    registerCcProviders(ccRegistry, config, {
      eslint: () => new EslintCcProvider(config.cc.eslintPath),
      radon: () => new RadonCcProvider(config.cc.pythonPath),
      pmd: () => new PmdCcProvider(config.cc.pmdPath),
    });

    const workspaceRootUri = workspaceFolder?.uri.toString();
    const churnProvider = config.churn.enabled && workspaceRootUri
      ? new GitChurnAdapter(workspaceRootUri)
      : undefined;

    const gitignoreFilter = await resolveGitignoreFilter(workspaceFolder, config.fileFilter.respectGitignore);

    const lspCallGraph = new VsCodeCallGraphProvider(token, config.debugEnabled ? this.logger : undefined, gitignoreFilter);
    const logger = config.debugEnabled ? this.logger : undefined;
    const callGraphProvider = workspaceFolder
      ? new HybridCallGraphProvider(lspCallGraph, new NativeCallGraphProvider(workspaceFolder.uri.fsPath), logger)
      : lspCallGraph;

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
