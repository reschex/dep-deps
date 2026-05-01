/**
 * Pure, testable TypeScript call graph builder using the Compiler API.
 *
 * Walks CallExpression and NewExpression nodes in a ts.Program,
 * resolving caller and callee to canonical `uri#line:character` symbol IDs
 * that match NodeSymbolProvider output.
 */

import * as ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CallEdge } from '../../core/rank';

/**
 * Build a canonical symbol ID for a declaration.
 * Format: `file-uri#line:character` (0-based), matching NodeSymbolProvider.
 *
 * NodeSymbolProvider uses `node.getStart(sourceFile)` for FunctionDeclaration/MethodDeclaration
 * (which points to the declaration start, e.g. the `export` keyword), and
 * `initializer.getStart()` for VariableDeclaration with arrow/function expression.
 * This function replicates that exact positioning logic.
 */
function symbolIdForDeclaration(decl: ts.Declaration): string | undefined {
  const nameNode = (decl as ts.NamedDeclaration).name;
  if (!nameNode) return undefined;

  const sf = decl.getSourceFile();

  // Determine the position node to match NodeSymbolProvider's createSymbol logic:
  // - FunctionDeclaration/MethodDeclaration/Accessors: use decl.getStart() (declaration start)
  // - VariableDeclaration with arrow/function: use initializer.getStart()
  let positionNode: ts.Node = decl;
  if (ts.isVariableDeclaration(decl) && decl.initializer &&
    (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
    positionNode = decl.initializer;
  }

  const pos = sf.getLineAndCharacterOfPosition(positionNode.getStart(sf));
  const fileUri = pathToFileURL(sf.fileName).toString();
  return `${fileUri}#${pos.line}:${pos.character}`;
}

/** Check if a declaration is a function-like node that NodeSymbolProvider would extract. */
function isFunctionLikeDeclaration(node: ts.Declaration): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/** Check if a declaration is a variable with an arrow/function initializer. */
function isVariableWithFunctionInit(node: ts.Declaration): node is ts.VariableDeclaration {
  return (
    ts.isVariableDeclaration(node) &&
    !!node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  );
}

/**
 * Resolve the callee symbol ID from a call or new expression.
 * Returns undefined if the callee cannot be resolved to a known function/method.
 */
function resolveCalleeId(
  node: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
): string | undefined {
  // For property access calls like `this.validate()` or `obj.method()`,
  // getSymbolAtLocation must be called on the name identifier part of the
  // PropertyAccessExpression — not on the full expression node — to reliably
  // return the method symbol across TypeScript versions and module configurations.
  const calleeNode = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name
    : node.expression;
  const exprSym = checker.getSymbolAtLocation(calleeNode);
  if (!exprSym) return undefined;

  const sym = exprSym.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(exprSym)
    : exprSym;

  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl) return undefined;

  if (!isFunctionLikeDeclaration(decl) && !isVariableWithFunctionInit(decl)) {
    return undefined;
  }

  return symbolIdForDeclaration(decl);
}

/**
 * Resolve the caller symbol ID by walking up the AST to the enclosing function/method.
 * Returns undefined if the call is at the top level (not inside any function).
 */
function resolveCallerId(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    // Skip anonymous ArrowFunction/FunctionExpression nodes — they have no AST name
    // property and cannot produce a symbol ID. Continue walking up to the enclosing
    // VariableDeclaration, which does have a name and will be caught by
    // isVariableWithFunctionInit on the next iteration.
    const hasName = !!(current as ts.NamedDeclaration).name;
    if (hasName && (isFunctionLikeDeclaration(current as ts.Declaration) || isVariableWithFunctionInit(current as ts.Declaration))) {
      return symbolIdForDeclaration(current as ts.Declaration);
    }
    current = current.parent;
  }
  return undefined; // top-level expression, not inside a function
}

/**
 * Build call graph edges from TypeScript/JavaScript source files.
 *
 * Creates a `ts.Program` covering the given files and walks CallExpression / NewExpression
 * nodes, resolving each to caller→callee edges with deduplicated, self-call-excluded results.
 *
 * @param rootPath  Workspace root path (used for module resolution)
 * @param fileUris  Source file URIs (file:// scheme or absolute paths)
 * @returns Deduplicated call edges with symbol IDs in `uri#line:character` format
 */
export async function buildTypeScriptCallEdges(
  rootPath: string,
  fileUris: string[],
): Promise<CallEdge[]> {
  const filePaths = fileUris.map((u) =>
    u.startsWith('file://') ? fileURLToPath(u) : u,
  );

  const program = ts.createProgram(filePaths, {
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    module: ts.ModuleKind.CommonJS,
    baseUrl: rootPath,
  });
  const checker = program.getTypeChecker();
  const edges: CallEdge[] = [];
  const seen = new Set<string>();

  // Normalize paths for comparison: TS uses forward slashes on all platforms,
  // but fileURLToPath may produce backslashes on Windows.
  const normalizedPaths = new Set(filePaths.map((p) => p.replace(/\\/g, '/')));

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!normalizedPaths.has(sourceFile.fileName)) continue;

    ts.forEachChild(sourceFile, function visit(node) {
      // Note: NewExpression is visited here but constructor calls (new Widget())
      // currently produce no edge — resolveCalleeId returns undefined for class
      // symbols because ClassDeclaration is not a function-like declaration.
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callerId = resolveCallerId(node);
        const calleeId = resolveCalleeId(node, checker);
        if (callerId && calleeId && callerId !== calleeId) {
          const key = `${callerId}→${calleeId}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ caller: callerId, callee: calleeId });
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return edges;
}
