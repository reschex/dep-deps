/**
 * Node.js adapter for SymbolProvider port.
 * Uses TypeScript Compiler API to extract function symbols from source files.
 */

import * as ts from 'typescript';
import { readFile } from 'node:fs/promises';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';
import { toFilePath } from '../patterns';

export class NodeSymbolProvider implements SymbolProvider {
  /**
   * Extract function symbols from a TypeScript/JavaScript file.
   * @param uri File path (can be file:// URI or absolute path)
   * @returns Array of function symbols found in the file
   */
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const filePath = toFilePath(uri);
    const content = await readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const symbols: FunctionSymbolInfo[] = [];

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

    function nameOf(node: { name?: ts.PropertyName | ts.BindingName }): string | undefined {
      if (!node.name) return undefined;
      return ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
    }

    function pushNamedSymbol(
      nameSource: { name?: ts.PropertyName | ts.BindingName },
      positionNode: ts.Node,
    ): void {
      const name = nameOf(nameSource);
      if (!name) return;
      symbols.push(createSymbol(name, positionNode));
    }

    function extractSymbol(node: ts.FunctionDeclaration | ts.MethodDeclaration): void {
      if (!node.body) return;
      pushNamedSymbol(node, node);
    }

    function hasFunctionInitializer(
      node: ts.Node,
    ): node is (ts.VariableDeclaration | ts.PropertyDeclaration) & { initializer: ts.ArrowFunction | ts.FunctionExpression } {
      if (!ts.isVariableDeclaration(node) && !ts.isPropertyDeclaration(node)) return false;
      const init = node.initializer;
      return !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
    }

    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        extractSymbol(node);
      } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        pushNamedSymbol(node, node);
      } else if (hasFunctionInitializer(node)) {
        pushNamedSymbol(node, node.initializer);
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return symbols;
  }
}
