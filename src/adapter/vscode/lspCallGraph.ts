import * as vscode from "vscode";
import type { CallEdge } from "../../core/rank";
import type { Logger } from "../../core/ports";
import type { UriFilter } from "../../core/gitignoreFilter";
import { collectCallEdgesViaAdapter, type CallHierarchyAdapter } from "./lspCallGraphAdapter";
import { flattenFunctionSymbols } from "./documentSymbols";
import { symbolIdFromUriRange } from "./symbolId";
import { parseSymbolIdParts, supportedSchemes } from "../../core/lspCallGraphParsing";
import { SOURCE_FILE_GLOB, EXCLUDE_GLOB, isTestFileUri } from "./configuration";

export type CallGraphCollectOptions = {
  readonly token?: vscode.CancellationToken;
  readonly maxFiles?: number;
  /** When set, only scan files under this folder URI for call hierarchy roots. */
  readonly rootUri?: string;
  /** When true, exclude test files from call-graph root discovery. Defaults to true. */
  readonly excludeTests?: boolean;
  /** Optional logger for per-file progress during call graph construction. */
  readonly logger?: Logger;
  /** Optional URI-based file exclusion filter (e.g. gitignore). Files returning true are excluded. */
  readonly uriFilter?: UriFilter;
};

async function discoverFiles(maxFiles: number, rootUri: string | undefined, excludeTests: boolean): Promise<vscode.Uri[]> {
  const pattern: string | vscode.RelativePattern = rootUri
    ? new vscode.RelativePattern(vscode.Uri.parse(rootUri), SOURCE_FILE_GLOB)
    : SOURCE_FILE_GLOB;
  // Request extra files to compensate for test files that will be filtered out.
  const limit = excludeTests ? maxFiles * 2 : maxFiles;
  const allFiles = await vscode.workspace.findFiles(pattern, EXCLUDE_GLOB, limit);
  // Programmatic filter — reliable across all platforms and pattern types.
  return excludeTests
    ? allFiles.filter((u) => !isTestFileUri(u.toString())).slice(0, maxFiles)
    : allFiles;
}

async function collectSymbolsForFile(uri: vscode.Uri): Promise<{ id: string; uriStr: string }[]> {
  try {
    await vscode.workspace.openTextDocument(uri);
  } catch (e) {
    console.debug(`[DDP] Cannot open ${uri.toString()} for call graph:`, e);
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
    return [];
  }
  return flattenFunctionSymbols(syms).map((fn) => ({
    id: symbolIdFromUriRange(uri, fn.selectionRange),
    uriStr: uri.toString(),
  }));
}

async function prepareCallHierarchyItem(
  symbolId: string,
  _token: vscode.CancellationToken
): Promise<vscode.CallHierarchyItem | undefined> {
  const parsed = parseSymbolIdParts(symbolId);
  if (!parsed) {
    return undefined;
  }
  const { uriStr, line, character } = parsed;
  const uri = vscode.Uri.parse(uriStr);
  try {
    await vscode.workspace.openTextDocument(uri);
  } catch (e) {
    console.debug(`[DDP] Cannot open ${uriStr} for outgoing calls:`, e);
    return undefined;
  }
  const pos = new vscode.Position(line, character);
  try {
    const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      "vscode.prepareCallHierarchy",
      uri,
      pos
    );
    return items?.[0];
  } catch (e) {
    console.debug(`[DDP] prepareCallHierarchy failed for ${symbolId}:`, e);
    return undefined;
  }
}

async function resolveOutgoingCalls(
  item: vscode.CallHierarchyItem,
  _token: vscode.CancellationToken
): Promise<string[]> {
  try {
    const raw = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
      "vscode.provideOutgoingCalls",
      item
    );
    const outgoing = raw ?? [];
    return outgoing.map((o) => {
      const r = o.to.selectionRange ?? o.to.range;
      return symbolIdFromUriRange(o.to.uri, r);
    });
  } catch (e) {
    console.debug(`[DDP] provideOutgoingCalls failed:`, e);
    return [];
  }
}

type BuildAdapterOptions = {
  readonly maxFiles: number;
  readonly token: vscode.CancellationToken;
  readonly rootUri: string | undefined;
  readonly excludeTests: boolean;
  readonly logger?: Logger;
  readonly uriFilter?: UriFilter;
};

function buildVscodeAdapter(opts: BuildAdapterOptions): CallHierarchyAdapter {
  const { maxFiles, token, rootUri, excludeTests, logger, uriFilter } = opts;
  return {
    async findFunctionSymbols() {
      let files = await discoverFiles(maxFiles, rootUri, excludeTests);
      if (uriFilter) {
        files = files.filter((u) => !uriFilter(u.toString()));
      }
      logger?.debug?.(`Call graph: scanning ${files.length} file(s) for symbols`);
      const result: { id: string; uriStr: string }[] = [];
      for (const uri of files) {
        if (!supportedSchemes.has(uri.scheme)) {
          continue;
        }
        if (token.isCancellationRequested) {
          break;
        }
        logger?.debug?.(`  call graph: ${uri.toString()}`);
        const symbols = await collectSymbolsForFile(uri);
        result.push(...symbols);
      }
      return result;
    },
    async getOutgoingCalleeIds(symbolId: string) {
      const item = await prepareCallHierarchyItem(symbolId, token);
      if (!item) {
        return [];
      }
      return resolveOutgoingCalls(item, token);
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
  const ownSource = options.token ? undefined : new vscode.CancellationTokenSource();
  const token = options.token ?? ownSource!.token;
  try {
    const adapter = buildVscodeAdapter({
      maxFiles: options.maxFiles ?? 500,
      token,
      rootUri: options.rootUri,
      excludeTests: options.excludeTests ?? true,
      logger: options.logger,
      uriFilter: options.uriFilter,
    });
    return await collectCallEdgesViaAdapter(adapter);
  } finally {
    ownSource?.dispose();
  }
}
