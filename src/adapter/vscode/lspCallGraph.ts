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

async function collectSymbolsForFile(
  uri: vscode.Uri,
  selectionIdMap: Map<string, string>
): Promise<{ id: string; uriStr: string }[]> {
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
  return flattenFunctionSymbols(syms).map((fn) => {
    // Use fn.range (full declaration range) for the edge ID — this matches
    // NodeSymbolProvider which uses node.getStart() (declaration start, e.g. the
    // `function`/`export`/`async` keyword). Using fn.selectionRange (name position)
    // would produce IDs that don't match symbolById keys, causing F=? in the impact tree.
    const id = symbolIdFromUriRange(uri, fn.range);
    // Keep selectionRange-based ID for vscode.prepareCallHierarchy, which requires
    // a position at or near the symbol name for reliable call hierarchy resolution.
    const lspId = symbolIdFromUriRange(uri, fn.selectionRange);
    selectionIdMap.set(id, lspId);
    return { id, uriStr: uri.toString() };
  });
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
      // Use range (declaration start) not selectionRange (name position) — must
      // match the same position logic used for caller IDs in collectSymbolsForFile.
      return symbolIdFromUriRange(o.to.uri, o.to.range);
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

/**
 * Normalize a callee ID against the set of known (discovered) symbol IDs.
 *
 * VS Code's call hierarchy may return a different `range.start` for a function
 * than the document symbol provider does for the *same* function (e.g. the call
 * hierarchy starts at `function` while the document symbol starts at `export`).
 * When this happens, the callee ID won't match the caller ID, breaking
 * multi-level impact tree traversal.
 *
 * This function finds the canonical symbol on the same line in the same file
 * and returns its ID instead of the raw callee ID.
 */
function normalizeCalleeId(
  rawId: string,
  symbolsByUri: ReadonlyMap<string, readonly { line: number; char: number; id: string }[]>,
  logger?: Logger
): string {
  const parsed = parseSymbolIdParts(rawId);
  if (!parsed) {
    return rawId;
  }
  const candidates = symbolsByUri.get(parsed.uriStr);
  if (!candidates?.length) {
    // File not in our index (e.g. external dep / node_modules) — expected, do not log.
    return rawId;
  }
  const sameLine = candidates.filter((c) => c.line === parsed.line);
  if (sameLine.length === 1) {
    return sameLine[0]!.id;
  }
  if (sameLine.length > 1) {
    // Multiple symbols on same line — pick closest character offset
    return sameLine.reduce((best, c) =>
      Math.abs(c.char - parsed.character) < Math.abs(best.char - parsed.character) ? c : best
    ).id;
  }
  // Suspicious: file is in our index but no symbol on this line.
  // Emit debug log so silent edge-mismatch fallbacks are observable.
  logger?.debug?.(
    `[DDP] normalizeCalleeId: no same-line symbol in ${parsed.uriStr} at line ${parsed.line} (raw=${rawId})`
  );
  return rawId;
}

function buildVscodeAdapter(opts: BuildAdapterOptions): CallHierarchyAdapter {
  const { maxFiles, token, rootUri, excludeTests, logger, uriFilter } = opts;
  // ---------------------------------------------------------------
  // Adapter state (closure-captured, mutable).
  //
  // CONTRACT: collectCallEdgesViaAdapter must call findFunctionSymbols()
  // exactly once and to completion BEFORE any getOutgoingCalleeIds() calls.
  // findFunctionSymbols populates both maps; getOutgoingCalleeIds reads them.
  // The adapter is single-use and not safe for concurrent invocation.
  // ---------------------------------------------------------------

  // Maps range-based edge IDs → selectionRange-based IDs for prepareCallHierarchy.
  // Edge IDs use fn.range (declaration start, matching NodeSymbolProvider/symbolById keys).
  // prepareCallHierarchy requires a position at/near the symbol name to work reliably.
  const selectionIdMap = new Map<string, string>();
  // Spatial index: uri → symbols on each line. Used to normalize callee IDs
  // from outgoing calls so they match the canonical caller IDs from document symbols.
  const symbolsByUri = new Map<string, { line: number; char: number; id: string }[]>();
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
        const symbols = await collectSymbolsForFile(uri, selectionIdMap);
        for (const sym of symbols) {
          const parsed = parseSymbolIdParts(sym.id);
          if (parsed) {
            let list = symbolsByUri.get(parsed.uriStr);
            if (!list) {
              list = [];
              symbolsByUri.set(parsed.uriStr, list);
            }
            list.push({ line: parsed.line, char: parsed.character, id: sym.id });
          }
        }
        result.push(...symbols);
      }
      return result;
    },
    async getOutgoingCalleeIds(symbolId: string) {
      // Use selectionRange-based ID for prepareCallHierarchy so the LSP finds the symbol.
      const lspId = selectionIdMap.get(symbolId) ?? symbolId;
      const item = await prepareCallHierarchyItem(lspId, token);
      if (!item) {
        return [];
      }
      const rawCalleeIds = await resolveOutgoingCalls(item, token);
      return rawCalleeIds.map((id) => normalizeCalleeId(id, symbolsByUri, logger));
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
