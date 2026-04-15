import * as vscode from "vscode";
import { registerDdp } from "./ddp/register";

export function activate(context: vscode.ExtensionContext): void {
  registerDdp(context);
}

export function deactivate(): void {}
