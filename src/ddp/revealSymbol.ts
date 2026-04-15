import * as vscode from "vscode";
import { parseUriFromSymbolId } from "./symbolId";

export async function revealSymbolById(id: string): Promise<void> {
  const hash = id.indexOf("#");
  if (hash <= 0) {
    return;
  }
  const uri = parseUriFromSymbolId(id);
  if (!uri) {
    return;
  }
  const rest = id.slice(hash + 1);
  const parts = rest.split(":");
  const line = parseInt(parts[0] ?? "", 10);
  const ch = parseInt(parts[1] ?? "", 10);
  let selection: vscode.Range | undefined;
  if (!Number.isNaN(line) && !Number.isNaN(ch)) {
    const p = new vscode.Position(line, ch);
    selection = new vscode.Range(p, p);
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, selection ? { selection } : {});
}
