import * as vscode from "vscode";

export async function openDocument(uri: vscode.Uri, selection?: vscode.Range): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, selection ? { selection } : {});
}
