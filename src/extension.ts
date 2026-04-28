import * as vscode from "vscode";
import { registerDdp } from "./adapter/vscode/register";

export function activate(context: vscode.ExtensionContext): void {
  registerDdp(context);
}

export function deactivate(): void {}
