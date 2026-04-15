import * as vscode from "vscode";
import type { CallEdge } from "../core/rank";
import { collectCallEdgesViaAdapter, type CallHierarchyAdapter } from "./lspCallGraphAdapter";
import { flattenFunctionSymbols } from "./documentSymbols";
import { symbolIdFromUriRange } from "./symbolId";
import { parseSymbolIdParts, supportedSchemes } from "../core/lspCallGraphParsing";
import { SOURCE_FILE_GLOB, EXCLUDE_GLOB, isTestFileUri } from "./configuration";

/** Call hierarchy exists at runtime from 1.52+; @types/vscode can omit it on older stubs. */
type LanguagesWithCallHierarchy = {
  prepareCallHierarchy(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Thenable<vscode.CallHierarchyItem[] | null | undefined>;
  provideCallHierarchyOutgoingCalls(
    item: vscode.CallHierarchyItem,
    token: vscode.CancellationToken
  ): Thenable<vscode.CallHierarchyOutgoingCall[] | null | undefined>;
};

function languagesCallHierarchy(): typeof vscode.languages & LanguagesWithCallHierarchy {
  return vscode.languages as typeof vscode.languages & LanguagesWithCallHierarchy;
}

export type CallGraphCollectOptions = {
  readonly token?: vscode.CancellationToken;
  readonly maxFiles?: number;
  /** When set, only scan files under this folder URI for call hierarchy roots. */
  readonly rootUri?: string;
  /** When true, exclude test files from call-graph root discovery. Defaults to true. */
  readonly excludeTests?: boolean;
};

function buildVscodeAdapter(maxFiles: number, token: vscode.CancellationToken, rootUri?: string, excludeTests: boolean = true): CallHierarchyAdapter {
  return {
    async findFunctionSymbols() {
      const pattern: string | vscode.RelativePattern = rootUri
        ? new vscode.RelativePattern(vscode.Uri.parse(rootUri), SOURCE_FILE_GLOB)
        : SOURCE_FILE_GLOB;
      // Request extra files to compensate for test files that will be filtered out.
      const limit = excludeTests ? maxFiles * 2 : maxFiles;
      const allFiles = await vscode.workspace.findFiles(
        pattern,
        EXCLUDE_GLOB,
        limit
      );
      // Programmatic filter — reliable across all platforms and pattern types.
      const files = excludeTests
        ? allFiles.filter((u) => !isTestFileUri(u.toString())).slice(0, maxFiles)
        : allFiles;
      const result: { id: string; uriStr: string }[] = [];
      for (const uri of files) {
        if (!supportedSchemes.has(uri.scheme)) {
          continue;
        }
        try {
          // Must open document before symbol provider runs
          await vscode.workspace.openTextDocument(uri);
        } catch (e) {
          console.debug(`[DDP] Cannot open ${uri.toString()} for call graph:`, e);
        }
        if (token.isCancellationRequested) {
          break;
        }
        let syms: vscode.DocumentSymbol[] | undefined;
        try {
          syms = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider",
            uri
          );
        } catch (e) {
          console.debug(`[DDP] Symbol provider failed for ${uri.toString()}:`, e);
        }
        if (!syms?.length) {
          continue;
        }
        for (const fn of flattenFunctionSymbols(syms)) {
          result.push({
            id: symbolIdFromUriRange(uri, fn.selectionRange),
            uriStr: uri.toString(),
          });
        }
      }
      return result;
    },
    async getOutgoingCalleeIds(symbolId: string) {
      const parsed = parseSymbolIdParts(symbolId);
      if (!parsed) {
        return [];
      }
      const { uriStr, line, ch } = parsed;
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr));
      } catch (e) {
        console.debug(`[DDP] Cannot open ${uriStr} for outgoing calls:`, e);
        return [];
      }
      const pos = new vscode.Position(line, ch);
      let items: vscode.CallHierarchyItem[] | null | undefined;
      try {
        items = await languagesCallHierarchy().prepareCallHierarchy(doc, pos, token);
      } catch (e) {
        console.debug(`[DDP] prepareCallHierarchy failed for ${symbolId}:`, e);
        return [];
      }
      const item = items?.[0];
      if (!item) {
        return [];
      }
      let outgoing: vscode.CallHierarchyOutgoingCall[];
      try {
        const raw = await languagesCallHierarchy().provideCallHierarchyOutgoingCalls(item, token);
        outgoing = raw ?? [];
      } catch (e) {
        console.debug(`[DDP] provideCallHierarchyOutgoingCalls failed:`, e);
        return [];
      }
      return outgoing.map((o) => {
        const r = o.to.selectionRange ?? o.to.range;
        return symbolIdFromUriRange(o.to.uri, r);
      });
    },
    isCancelled() {
      return token.isCancellationRequested;
    },
  };
}

/**
 * Collect call edges using LSP call hierarchy (works for TS/JS, Java, Python with appropriate extensions).
 */
export async function collectCallEdgesFromWorkspace(
  options: CallGraphCollectOptions = {}
): Promise<CallEdge[]> {
  const token = options.token ?? new vscode.CancellationTokenSource().token;
  const maxFiles = options.maxFiles ?? 500;
  const adapter = buildVscodeAdapter(maxFiles, token, options.rootUri, options.excludeTests ?? true);
  return collectCallEdgesViaAdapter(adapter);
}
