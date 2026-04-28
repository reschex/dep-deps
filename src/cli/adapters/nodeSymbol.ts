/**
 * Node.js adapter for SymbolProvider port.
 * Uses TypeScript Compiler API to extract function symbols from source files.
 */

import * as ts from 'typescript';
import { readFile } from 'node:fs/promises';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';

export class NodeSymbolProvider implements SymbolProvider {
  /**
   * Extract function symbols from a TypeScript/JavaScript file.
   * @param uri File path (can be file:// URI or absolute path)
   * @returns Array of function symbols found in the file
   */
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    // Convert URI to file path if needed
    const filePath = uri.startsWith('file://') 
      ? uri.replace('file://', '').replace(/^\/([A-Z]:)/, '$1')
      : uri;

    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Parse using TypeScript compiler API
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const symbols: FunctionSymbolInfo[] = [];

    // Extract symbol information from function or method declaration
    function extractSymbol(node: ts.FunctionDeclaration | ts.MethodDeclaration): void {
      if (!node.name) return;
      
      const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.end);

      symbols.push({
        name,
        selectionStartLine: start.line,
        selectionStartCharacter: start.character,
        bodyStartLine: start.line,
        bodyEndLine: end.line,
      });
    }

    // Traverse AST to find function declarations and method declarations
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        extractSymbol(node);
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return symbols;
  }
}
