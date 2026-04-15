import * as vscode from "vscode";

export function symbolIdFromUriRange(uri: vscode.Uri, range: vscode.Range): string {
  const s = range.start;
  return `${uri.toString()}#${s.line}:${s.character}`;
}

export function parseUriFromSymbolId(id: string): vscode.Uri | undefined {
  const hash = id.indexOf("#");
  if (hash <= 0) {
    return undefined;
  }
  try {
    return vscode.Uri.parse(id.slice(0, hash));
  } catch {
    return undefined;
  }
}
