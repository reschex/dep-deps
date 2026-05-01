/**
 * Node.js adapter for SymbolProvider port.
 * Uses TypeScript Compiler API to extract function symbols from source files.
 */

import * as ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';

export class NodeSymbolProvider implements SymbolProvider {
  /**
   * Extract function symbols from a TypeScript/JavaScript file.
   * @param uri File path (can be file:// URI or absolute path)
   * @returns Array of function symbols found in the file
   */
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    // Convert URI to file path if needed
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;

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

    // Create symbol info from name and node
    function createSymbol(name: string, node: ts.Node): FunctionSymbolInfo {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.end);

      return {
        name,
        selectionStartLine: start.line,
        selectionStartCharacter: start.character,
        bodyStartLine: start.line,
        bodyEndLine: end.line,
      };
    }

    // Extract the text of a named declaration's name
    function nameOf(node: { name?: ts.PropertyName | ts.BindingName }): string | undefined {
      if (!node.name) return undefined;
      return ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
    }

    // Extract symbol information from function or method declaration
    function extractSymbol(node: ts.FunctionDeclaration | ts.MethodDeclaration): void {
      if (!node.body) return;
      const name = nameOf(node);
      if (!name) return;
      symbols.push(createSymbol(name, node));
    }

    // Traverse AST to find function declarations and method declarations
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        extractSymbol(node);
      } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const name = nameOf(node);
        if (name) {
          symbols.push(createSymbol(name, node));
        }
      } else if (ts.isVariableDeclaration(node)) {
        // Check if this is an arrow function or function expression assignment
        if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          const name = nameOf(node);
          if (name) {
            symbols.push(createSymbol(name, node.initializer));
          }
        }
      } else if (ts.isPropertyDeclaration(node)) {
        // Check if this is a class property with arrow function or function expression
        if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          const name = nameOf(node);
          if (name) {
            symbols.push(createSymbol(name, node.initializer));
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return symbols;
  }
}
