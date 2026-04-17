import * as vscode from "vscode";
import type { StatementCover } from "../core/coverageMap";
import { mergeLcovMaps, parseLcovToStatementCovers } from "../core/lcovParse";
import { normalizeLcovPathToUri } from "./lcov";
import { CoverageStore } from "../core/coverageStore";

export { CoverageStore } from "../core/coverageStore";

function resolveLcovSfToUri(folder: vscode.WorkspaceFolder, sf: string): vscode.Uri | undefined {
  const trimmed = sf.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replaceAll("\\", "/");
  try {
    if (/^[A-Za-z]:\//u.exec(normalized)) {
      return vscode.Uri.file(normalized.replaceAll("/", "\\"));
    }
    if (normalized.startsWith("/")) {
      return vscode.Uri.file(trimmed);
    }
  } catch (e) {
    console.debug(`[DDP] Failed to parse LCOV path '${sf}':`, e);
  }
  return normalizeLcovPathToUri(folder, trimmed);
}

export async function loadLcovIntoStore(
  store: CoverageStore,
  pattern: string,
  token: vscode.CancellationToken
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return;
  }
  const maps: Map<string, StatementCover[]>[] = [];
  for (const folder of folders) {
    if (token.isCancellationRequested) {
      break;
    }
    const folderMaps = await loadLcovFromFolder(folder, pattern, token);
    maps.push(...folderMaps);
  }
  const merged = mergeLcovMaps(maps);
  for (const [k, v] of merged) {
    store.ingestStatementCovers(vscode.Uri.parse(k).toString(), v);
  }
}

async function loadLcovFromFolder(
  folder: vscode.WorkspaceFolder,
  pattern: string,
  token: vscode.CancellationToken
): Promise<Map<string, StatementCover[]>[]> {
  const maps: Map<string, StatementCover[]>[] = [];
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, pattern),
    "**/node_modules/**",
    50
  );
  for (const file of files) {
    if (token.isCancellationRequested) {
      break;
    }
    const buf = await vscode.workspace.fs.readFile(file);
    const text = Buffer.from(buf).toString("utf8");
    const parsed = parseLcovToStatementCovers(text);
    const resolved = new Map<string, StatementCover[]>();
    for (const [sf, stmts] of parsed) {
      const uri = resolveLcovSfToUri(folder, sf);
      if (uri) {
        resolved.set(uri.toString(), stmts);
      }
    }
    maps.push(resolved);
  }
  return maps;
}
