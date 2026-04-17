import * as vscode from "vscode";

export function normalizeLcovPathToUri(
  workspace: vscode.WorkspaceFolder,
  lcovPath: string
): vscode.Uri | undefined {
  const t = lcovPath.trim();
  if (!t) {
    return undefined;
  }
  try {
    if (t.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(t)) {
      return vscode.Uri.file(t);
    }
  } catch {
    return undefined;
  }
  // Normalize backslashes to forward slashes for consistent path joining
  const normalized = t.replaceAll('\\', "/");
  return vscode.Uri.joinPath(workspace.uri, normalized);
}
