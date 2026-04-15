import * as vscode from "vscode";

/** Flatten document symbols: functions, methods, constructors. */
export function flattenFunctionSymbols(
  symbols: readonly vscode.DocumentSymbol[],
  out: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol[] {
  for (const s of symbols) {
    if (
      s.kind === vscode.SymbolKind.Function ||
      s.kind === vscode.SymbolKind.Method ||
      s.kind === vscode.SymbolKind.Constructor
    ) {
      out.push(s);
    }
    if (s.children?.length) {
      flattenFunctionSymbols(s.children, out);
    }
  }
  return out;
}

export function isFunctionLike(kind: vscode.SymbolKind): boolean {
  return (
    kind === vscode.SymbolKind.Function ||
    kind === vscode.SymbolKind.Method ||
    kind === vscode.SymbolKind.Constructor
  );
}

/** Fetch and flatten function symbols for a document URI via the VS Code symbol provider. */
export async function getFlatFunctionSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
  let syms: vscode.DocumentSymbol[] | undefined;
  try {
    syms = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri
    );
  } catch (e) {
    console.debug(`[DDP] executeDocumentSymbolProvider failed for ${uri.toString()}:`, e);
  }
  return syms?.length ? flattenFunctionSymbols(syms) : [];
}
