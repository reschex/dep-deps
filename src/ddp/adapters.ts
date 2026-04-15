/**
 * VS Code adapter implementations for port interfaces.
 *
 * These adapt VS Code APIs to the infrastructure-agnostic ports defined in core/ports.ts,
 * keeping domain orchestration testable without VS Code runtime.
 */

import * as vscode from "vscode";
import type {
  DocumentProvider,
  DocumentInfo,
  SymbolProvider,
  FunctionSymbolInfo,
  CallGraphProvider,
  CoverageProvider,
  CyclomaticComplexityProvider,
  CcResult,
  Logger,
} from "../core/ports";
import type { StatementCover } from "../core/coverageMap";
import type { CallEdge } from "../core/rank";
import { flattenFunctionSymbols } from "./documentSymbols";
import { collectCallEdgesFromWorkspace } from "./lspCallGraph";
import { CoverageStore, loadLcovIntoStore } from "./coverageStore";
import { eslintCcForFile } from "./cc/eslintComplexity";
import { radonCcForFile } from "./cc/radonCc";
import { pmdCcForFile } from "./cc/pmdComplexity";

import { SOURCE_FILE_GLOB, EXCLUDE_GLOB, buildExcludeGlob } from "./configuration";

/**
 * Build a vscode.RelativePattern scoped to a given folder URI,
 * or return the workspace-wide glob when no scope is provided.
 */
function scopedPattern(glob: string, rootUri?: string): string | vscode.RelativePattern {
  if (!rootUri) {
    return glob;
  }
  return new vscode.RelativePattern(vscode.Uri.parse(rootUri), glob);
}

// ─── DocumentProvider ────────────────────────────────────────────────────────

export class VsCodeDocumentProvider implements DocumentProvider {
  private readonly excludeGlob: string;

  constructor(excludeTests: boolean = true) {
    this.excludeGlob = buildExcludeGlob(excludeTests);
  }

  async findSourceFiles(maxFiles: number, rootUri?: string): Promise<string[]> {
    const pattern = scopedPattern(SOURCE_FILE_GLOB, rootUri);
    const uris = await vscode.workspace.findFiles(pattern, this.excludeGlob, maxFiles);
    return uris.filter((u) => u.scheme === "file").map((u) => u.toString());
  }

  async openDocument(uri: string): Promise<DocumentInfo | undefined> {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      return {
        uri: doc.uri.toString(),
        languageId: doc.languageId,
        getText(startLine: number, endLine: number): string {
          const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
          return doc.getText(range);
        },
      };
    } catch (e) {
      console.debug(`[DDP] Failed to open document ${uri}:`, e);
      return undefined;
    }
  }
}

// ─── SymbolProvider ──────────────────────────────────────────────────────────

export class VsCodeSymbolProvider implements SymbolProvider {
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const vscUri = vscode.Uri.parse(uri);
    let syms: vscode.DocumentSymbol[] | undefined;
    try {
      syms = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        vscUri
      );
    } catch (e) {
      console.debug(`[DDP] Symbol provider failed for ${uri}:`, e);
      return [];
    }
    if (!syms?.length) {
      return [];
    }
    return flattenFunctionSymbols(syms).map((fn) => ({
      name: fn.name,
      selectionStartLine: fn.selectionRange.start.line,
      selectionStartCharacter: fn.selectionRange.start.character,
      bodyStartLine: fn.range.start.line,
      bodyEndLine: fn.range.end.line,
    }));
  }
}

// ─── CallGraphProvider ───────────────────────────────────────────────────────

export class VsCodeCallGraphProvider implements CallGraphProvider {
  constructor(
    private readonly token: vscode.CancellationToken,
    private readonly excludeTests: boolean = true,
  ) {}

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    return collectCallEdgesFromWorkspace({ token: this.token, maxFiles, rootUri, excludeTests: this.excludeTests });
  }
}

// ─── CoverageProvider ────────────────────────────────────────────────────────

export class VsCodeCoverageProvider implements CoverageProvider {
  private readonly store: CoverageStore;
  private readonly lcovGlob: string;
  private readonly token: vscode.CancellationToken;

  constructor(store: CoverageStore, lcovGlob: string, token: vscode.CancellationToken) {
    this.store = store;
    this.lcovGlob = lcovGlob;
    this.token = token;
  }

  async loadCoverage(): Promise<void> {
    await loadLcovIntoStore(this.store, this.lcovGlob, this.token);
  }

  getStatements(uri: string): StatementCover[] | undefined {
    return this.store.get(uri);
  }
}

// ─── CC Providers (per-language adapters) ────────────────────────────────────

/** Resolve workspace folder cwd for a file URI, returning "" if unknown. */
function workspaceCwd(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? "";
}

export class EslintCcProvider implements CyclomaticComplexityProvider {
  constructor(private readonly eslintPath: string) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const uri = vscode.Uri.parse(doc.uri);
    if (uri.scheme !== "file") {
      return { byLine: new Map(), byName: new Map() };
    }
    const byLine = await eslintCcForFile(doc.languageId, uri.fsPath, workspaceCwd(uri), this.eslintPath);
    return { byLine, byName: new Map() };
  }
}

export class RadonCcProvider implements CyclomaticComplexityProvider {
  constructor(private readonly pythonPath: string) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const uri = vscode.Uri.parse(doc.uri);
    if (uri.scheme !== "file") {
      return { byLine: new Map(), byName: new Map() };
    }
    const radonMap = await radonCcForFile(doc.languageId, uri.fsPath, workspaceCwd(uri), this.pythonPath);
    return { byLine: new Map(), byName: radonMap };
  }
}

export class PmdCcProvider implements CyclomaticComplexityProvider {
  constructor(private readonly pmdPath: string) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const uri = vscode.Uri.parse(doc.uri);
    if (uri.scheme !== "file") {
      return { byLine: new Map(), byName: new Map() };
    }
    const byLine = await pmdCcForFile(doc.languageId, uri.fsPath, workspaceCwd(uri), this.pmdPath);
    return { byLine, byName: new Map() };
  }
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export class VsCodeLogger implements Logger {
  private readonly channel: vscode.OutputChannel;

  constructor(channel: vscode.OutputChannel) {
    this.channel = channel;
  }

  info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  error(message: string, err?: unknown): void {
    const suffix = err instanceof Error ? `: ${err.message}` : "";
    this.channel.appendLine(`[ERROR] ${message}${suffix}`);
  }
}
