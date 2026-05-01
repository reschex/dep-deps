# Implementation Guide: Language-Native Analysis (ADR-005)

This guide provides step-by-step implementation specifications for the work defined in [ADR-005](../architecture/ADR-005-language-native-analysis.md). Read that ADR first.

## Table of Contents

1. [Prerequisites and Context](#prerequisites-and-context)
2. [Phase 1a: Python Symbol Extraction](#phase-1a-python-symbol-extraction)
3. [Phase 1b: Java Symbol Extraction](#phase-1b-java-symbol-extraction)
4. [Phase 1c: Replace VsCodeSymbolProvider](#phase-1c-replace-vscodesymbolprovider)
5. [Phase 2a: TypeScript Call Graph](#phase-2a-typescript-call-graph)
6. [Phase 2b: Wire Call Graph into CLI](#phase-2b-wire-call-graph-into-cli)
7. [Phase 2c: Hybrid VS Code Call Graph](#phase-2c-hybrid-vs-code-call-graph)
8. [Testing Strategy](#testing-strategy)
9. [Validation Checklist](#validation-checklist)

---

## Prerequisites and Context

### What Exists Today

The following language-layer implementations are already complete and provide the patterns to follow:

| File | Pattern to Follow |
|------|------------------|
| `src/language/typescript/symbols.ts` | Target shape for Python/Java symbol providers |
| `src/language/python/cc/radonSpawn.ts` | Subprocess pattern for Python-based tools |
| `src/language/java/cc/pmdSpawn.ts` | Subprocess pattern for PMD-based tools |
| `src/language/java/cc/pmdParse.ts` | XML parsing pattern for PMD output |
| `src/shared/spawnCollect.ts` | `spawnAndCollect()` — use this for all subprocesses |

### Symbol ID Format

All symbol IDs must follow the format `uri#line:character` where `line` and `character` are **0-based**. This matches `symbolIdFromUriRange` in the VS Code adapter and `makeSymbolId` in `analysisOrchestrator.ts`. New implementations must produce IDs in this format or call graph edges will not match symbols.

### Port Contract

Every symbol provider must implement `SymbolProvider` from `src/core/ports.ts`:

```typescript
interface SymbolProvider {
  getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]>;
}

type FunctionSymbolInfo = {
  readonly name: string;
  readonly selectionStartLine: number;    // 0-based, points to function name
  readonly selectionStartCharacter: number;
  readonly bodyStartLine: number;         // 0-based, start of function body
  readonly bodyEndLine: number;           // 0-based, end of function body (inclusive)
};
```

Every call graph provider must implement `CallGraphProvider`:

```typescript
interface CallGraphProvider {
  collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]>;
}

type CallEdge = { readonly caller: string; readonly callee: string };
// Both caller and callee are symbol IDs in `uri#line:character` format.
```

### TDD Discipline

Every step in this guide follows RED-GREEN-REFACTOR:
1. Write a failing test that specifies the expected output for a fixture file
2. Write the minimal implementation to pass it
3. Refactor without changing behaviour

Do not write implementation code before the failing test exists.

---

## Phase 1a: Python Symbol Extraction

**New file:** `src/language/python/symbols.ts`  
**New file:** `src/language/python/symbolsParse.ts`  
**New file:** `src/language/python/symbolsSpawn.ts`

### File Structure

Follow the three-file pattern of `radonCc.ts` / `radonSpawn.ts` / `radonParse.ts`:

- `symbolsSpawn.ts` — invokes Python with the extraction script
- `symbolsParse.ts` — converts raw JSON string to `FunctionSymbolInfo[]`
- `symbols.ts` — `PythonSymbolProvider` class implementing the `SymbolProvider` port

### The Extraction Script

The script is passed inline to `python -c`. It uses only the standard library (`ast`, `json`, `sys`) and requires Python 3.8+, which is the same minimum version Radon requires.

```python
import ast, json, sys

def extract(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            source = f.read()
    except Exception as e:
        print('[]')
        return

    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError:
        print('[]')
        return

    symbols = []

    def visit(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.append({
                    'name': child.name,
                    'selectionStartLine': child.lineno - 1,
                    'selectionStartCharacter': child.col_offset,
                    'bodyStartLine': child.lineno - 1,
                    'bodyEndLine': (child.end_lineno or child.lineno) - 1
                })
            visit(child)

    visit(tree)
    print(json.dumps(symbols))

extract(sys.argv[1])
```

Key decisions:
- Lines are converted to **0-based** (`lineno - 1`) to match the port contract
- `end_lineno` is available in Python 3.8+; the `or child.lineno` guard handles the rare case where it is `None`
- `visit()` recurses into all nodes, so nested functions and class methods are all captured
- Syntax errors and file read errors produce `[]` (graceful degradation, same as Radon on error)
- No `ast.walk` — use explicit recursion so that class-nested methods are discovered in document order

### symbolsSpawn.ts

```typescript
import { spawnAndCollect } from '../../../shared/spawnCollect';

const EXTRACT_SCRIPT = `...` // inline Python script above

export async function runPythonSymbolExtraction(
  pythonPath: string,
  filePath: string,
  cwd: string,
  timeoutMs: number
): Promise<string> {
  return spawnAndCollect(
    pythonPath,
    ['-c', EXTRACT_SCRIPT, filePath],
    cwd,
    timeoutMs
  );
}
```

### symbolsParse.ts

```typescript
import type { FunctionSymbolInfo } from '../../../core/ports';

type RawSymbol = {
  name: string;
  selectionStartLine: number;
  selectionStartCharacter: number;
  bodyStartLine: number;
  bodyEndLine: number;
};

export function parsePythonSymbolsJson(
  jsonText: string
): FunctionSymbolInfo[] {
  if (!jsonText.trim()) return [];
  try {
    const raw: unknown = JSON.parse(jsonText);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isRawSymbol)
      .map((r) => ({
        name: r.name,
        selectionStartLine: r.selectionStartLine,
        selectionStartCharacter: r.selectionStartCharacter,
        bodyStartLine: r.bodyStartLine,
        bodyEndLine: r.bodyEndLine,
      }));
  } catch {
    return [];
  }
}

function isRawSymbol(x: unknown): x is RawSymbol {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['name'] === 'string' &&
    typeof r['selectionStartLine'] === 'number' &&
    typeof r['selectionStartCharacter'] === 'number' &&
    typeof r['bodyStartLine'] === 'number' &&
    typeof r['bodyEndLine'] === 'number'
  );
}
```

### symbols.ts

```typescript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { SymbolProvider, FunctionSymbolInfo } from '../../../core/ports';
import { runPythonSymbolExtraction } from './symbolsSpawn';
import { parsePythonSymbolsJson } from './symbolsParse';

const DEFAULT_PYTHON = 'python3';
const TIMEOUT_MS = 10_000;

export class PythonSymbolProvider implements SymbolProvider {
  constructor(private readonly pythonPath: string = DEFAULT_PYTHON) {}

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    const cwd = dirname(filePath);
    const raw = await runPythonSymbolExtraction(
      this.pythonPath,
      filePath,
      cwd,
      TIMEOUT_MS
    );
    return parsePythonSymbolsJson(raw);
  }
}
```

### Test fixtures

Create `src/language/python/fixtures/simple.py` with a known set of functions:

```python
def top_level():
    pass

class MyClass:
    def method(self):
        pass

    async def async_method(self):
        pass

def outer():
    def inner():
        pass
    return inner
```

The test for `symbolsParse.ts` uses inline JSON strings (no subprocess, fast). The test for `symbols.ts` (integration) can use a real `simple.py` fixture but must skip gracefully if `python3` is not in PATH.

---

## Phase 1b: Java Symbol Extraction

**New file:** `src/language/java/symbols.ts`  
**New file:** `src/language/java/symbolsParse.ts`

### Approach: Extend Existing PMD Infrastructure

The PMD CyclomaticComplexity violation XML already carries `method`, `class`, `beginline`, and `endline` attributes:

```xml
<violation beginline="15" endline="28" begincolumn="5" endcolumn="1"
           method="processOrder" class="OrderProcessor"
           rule="CyclomaticComplexity" ...>
  The method 'processOrder' has a cyclomatic complexity of 7.
</violation>
```

This means we already have the data needed to build `FunctionSymbolInfo[]`. No new PMD invocations, no new rules, no new tool dependencies.

### symbolsParse.ts

```typescript
import type { FunctionSymbolInfo } from '../../../core/ports';

/**
 * Extract FunctionSymbolInfo[] from PMD CyclomaticComplexity XML output.
 *
 * PMD reports one violation per method. The `beginline`, `endline`, and
 * `method` attributes give us everything we need for FunctionSymbolInfo.
 * Lines are converted from 1-based (PMD) to 0-based (port contract).
 */
export function parsePmdSymbolsXml(xmlText: string): FunctionSymbolInfo[] {
  const symbols: FunctionSymbolInfo[] = [];
  const seen = new Set<string>();

  const violationRe = /<violation\s([^>]*)>/gi;
  const beginlineRe = /\bbeginline="(\d+)"/i;
  const endlineRe = /\bendline="(\d+)"/i;
  const methodRe = /\bmethod="([^"]+)"/i;
  const ruleRe = /\brule="[a-z]*cyclomatic[a-z]*"/i;

  let match: RegExpExecArray | null;
  while ((match = violationRe.exec(xmlText)) !== null) {
    const attrs = match[1];
    if (!ruleRe.test(attrs)) continue;

    const methodMatch = methodRe.exec(attrs);
    const beginMatch = beginlineRe.exec(attrs);
    const endMatch = endlineRe.exec(attrs);

    if (!methodMatch || !beginMatch) continue;

    const name = methodMatch[1];
    const bodyStartLine = parseInt(beginMatch[1], 10) - 1; // 0-based
    const bodyEndLine = endMatch ? parseInt(endMatch[1], 10) - 1 : bodyStartLine;

    const key = `${name}:${bodyStartLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    symbols.push({
      name,
      selectionStartLine: bodyStartLine,
      selectionStartCharacter: 0,
      bodyStartLine,
      bodyEndLine,
    });
  }

  return symbols;
}
```

### symbols.ts

```typescript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { SymbolProvider, FunctionSymbolInfo } from '../../../core/ports';
import { runPmdCyclomaticComplexity } from './cc/pmdSpawn';
import { parsePmdSymbolsXml } from './symbolsParse';

const DEFAULT_PMD = 'pmd';
const TIMEOUT_MS = 30_000;

export class JavaSymbolProvider implements SymbolProvider {
  constructor(private readonly pmdPath: string = DEFAULT_PMD) {}

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    const cwd = dirname(filePath);
    // Reuse existing PMD CC invocation — the XML output contains method metadata
    const rawXml = await spawnPmdForSymbols(this.pmdPath, filePath, cwd, TIMEOUT_MS);
    return parsePmdSymbolsXml(rawXml);
  }
}
```

> **Note on `spawnPmdForSymbols`:** The existing `pmdSpawn.ts` returns a parsed `Map<number, number>` rather than the raw XML. Before writing `JavaSymbolProvider`, extract the raw spawn call into a shared `runPmdRaw(pmdPath, filePath, cwd, timeoutMs): Promise<string>` function that both `pmdSpawn.ts` and `symbolsParse.ts` can use. This is a small refactor — do it as a separate commit.

### Limitation

PMD only reports violations when a method has complexity ≥ 2 (by default). Methods with a single path (CC=1) may not appear in PMD output and will be missed by this approach. Document this in the function JSDoc. For the MVP this is acceptable; a full solution would require a dedicated "list all methods" PMD ruleset or a Java AST parser.

---

## Phase 1c: Replace VsCodeSymbolProvider

**Modified file:** `src/adapter/vscode/adapters.ts`

### Current Code

```typescript
export class VsCodeSymbolProvider implements SymbolProvider {
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const vscUri = vscode.Uri.parse(uri);
    let syms: vscode.DocumentSymbol[] | undefined;
    try {
      syms = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        vscUri
      );
    } catch (e) { ... }
    ...
  }
}
```

### Replacement

```typescript
import { NodeSymbolProvider } from '../../language/typescript/symbols';
import { PythonSymbolProvider } from '../../language/python/symbols';
import { JavaSymbolProvider } from '../../language/java/symbols';

const TS_LANGUAGE_IDS = new Set([
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact'
]);

export class NativeSymbolProvider implements SymbolProvider {
  private readonly ts: NodeSymbolProvider;
  private readonly python: PythonSymbolProvider;
  private readonly java: JavaSymbolProvider;

  constructor(config: { eslintPath: string; pythonPath: string; pmdPath: string }) {
    this.ts = new NodeSymbolProvider();
    this.python = new PythonSymbolProvider(config.pythonPath);
    this.java = new JavaSymbolProvider(config.pmdPath);
  }

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const languageId = detectLanguageId(uri);
    if (TS_LANGUAGE_IDS.has(languageId)) {
      return this.ts.getFunctionSymbols(uri);
    }
    if (languageId === 'python') {
      return this.python.getFunctionSymbols(uri);
    }
    if (languageId === 'java') {
      return this.java.getFunctionSymbols(uri);
    }
    return [];
  }
}

function detectLanguageId(uri: string): string {
  if (/\.(ts|tsx)$/i.test(uri)) return 'typescript';
  if (/\.(js|jsx|mjs|cjs)$/i.test(uri)) return 'javascript';
  if (/\.py$/i.test(uri)) return 'python';
  if (/\.java$/i.test(uri)) return 'java';
  return 'unknown';
}
```

Update `AnalysisService` in `analysisService.ts` to construct `NativeSymbolProvider` instead of `VsCodeSymbolProvider`, passing the relevant config paths.

> **Important:** The `VsCodeSymbolProvider` class should be deleted in the same commit, not just unused. Leaving dead code invites accidental reuse.

---

## Phase 2a: TypeScript Call Graph

**New file:** `src/language/typescript/callGraph.ts`  
**New file:** `src/language/typescript/callGraphBuild.ts` (pure, testable)

### Design

The call graph builder needs to:

1. Accept a list of source file paths (bounded by `maxFiles`)
2. Create a `ts.Program` covering those files
3. For each source file, walk `CallExpression` and `NewExpression` nodes
4. Resolve the callee's declaration symbol to a canonical `uri#line:character` ID
5. Resolve the caller by walking up the AST to find the enclosing function/method

### Symbol ID Resolution

Callee resolution must produce IDs that match those produced by `NodeSymbolProvider`. The correct approach:

```typescript
function symbolIdForDeclaration(
  decl: ts.Declaration,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): string | undefined {
  // Use the declaration's name node position (matches NodeSymbolProvider's selectionRange)
  const nameNode = (decl as ts.NamedDeclaration).name;
  if (!nameNode) return undefined;

  const sf = decl.getSourceFile();
  const pos = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf));
  const fileUri = pathToFileURL(sf.fileName).toString();
  return `${fileUri}#${pos.line}:${pos.character}`;
}
```

Callee resolution uses `checker.getSymbolAtLocation()` on the function expression of the call, then `checker.getAliasedSymbol()` to resolve through re-exports:

```typescript
function resolveCalleeId(
  callExpr: ts.CallExpression,
  checker: ts.TypeChecker
): string | undefined {
  const exprSym = checker.getSymbolAtLocation(callExpr.expression);
  if (!exprSym) return undefined;

  const sym = checker.getAliasedSymbol(exprSym);
  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl) return undefined;

  // Only include functions/methods — not constructors, classes, etc.
  if (
    !ts.isFunctionDeclaration(decl) &&
    !ts.isMethodDeclaration(decl) &&
    !ts.isArrowFunction(decl) &&
    !ts.isFunctionExpression(decl)
  ) {
    return undefined;
  }

  return symbolIdForDeclaration(decl, decl.getSourceFile(), checker);
}
```

Caller resolution walks up the AST to find the enclosing named function/method:

```typescript
function resolveCallerId(
  node: ts.Node,
  checker: ts.TypeChecker
): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name
    ) {
      return symbolIdForDeclaration(current, current.getSourceFile(), checker);
    }
    if (
      ts.isVariableDeclaration(current) &&
      current.initializer &&
      (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      return symbolIdForDeclaration(current, current.getSourceFile(), checker);
    }
    current = current.parent;
  }
  return undefined; // top-level expression, not inside a function
}
```

### callGraphBuild.ts

This is the pure, testable function with no `CallGraphProvider` wrapper. Tests use real fixture TypeScript files:

```typescript
export async function buildTypeScriptCallEdges(
  rootPath: string,
  fileUris: string[],
): Promise<CallEdge[]> {
  const filePaths = fileUris.map((u) =>
    u.startsWith('file://') ? fileURLToPath(u) : u
  );

  const program = ts.createProgram(filePaths, {
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
  });
  const checker = program.getTypeChecker();
  const edges: CallEdge[] = [];
  const seen = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!filePaths.includes(sourceFile.fileName)) continue;

    ts.forEachChild(sourceFile, function visit(node) {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callerId = resolveCallerId(node, checker);
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
```

### callGraph.ts

```typescript
import type { CallGraphProvider } from '../../core/ports';
import type { CallEdge } from '../../core/rank';
import { NodeDocumentProvider } from '../../adapter/cli/nodeDocument';
import { buildTypeScriptCallEdges } from './callGraphBuild';

export class NodeCallGraphProvider implements CallGraphProvider {
  constructor(private readonly rootPath: string) {}

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    const docProvider = new NodeDocumentProvider(this.rootPath);
    const fileUris = await docProvider.findSourceFiles(maxFiles, rootUri);
    // Filter to TS/JS only — other languages use null provider for now
    const tsUris = fileUris.filter((u) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(u));
    return buildTypeScriptCallEdges(this.rootPath, tsUris);
  }
}
```

### Test fixtures

Create `src/language/typescript/fixtures/callGraph/` with two files:

```typescript
// caller.ts
import { greet } from './callee';
export function run() {
  greet('world');
}
```

```typescript
// callee.ts
export function greet(name: string): void {
  console.log(`Hello, ${name}`);
}
```

Test: `buildTypeScriptCallEdges` on these two files produces exactly one `CallEdge` where `caller` contains `run` and `callee` contains `greet`.

---

## Phase 2b: Wire Call Graph into CLI

**Modified file:** `src/adapter/cli/cliAnalysis.ts`

Replace:

```typescript
const nullCallGraphProvider: CallGraphProvider = {
  async collectCallEdges(): Promise<CallEdge[]> {
    return [];
  },
};
```

With:

```typescript
import { NodeCallGraphProvider } from '../../language/typescript/callGraph';
```

And in `runCliAnalysis`:

```typescript
const callGraphProvider = new NodeCallGraphProvider(rootPath);
```

Update the `CliAnalysisOptions` type to add `callGraph?: boolean` if you want to allow opting out for large workspaces where the compilation time is prohibitive. The default should be `true`.

---

## Phase 2c: Hybrid VS Code Call Graph

**Modified file:** `src/adapter/vscode/adapters.ts`

```typescript
import { NodeCallGraphProvider } from '../../language/typescript/callGraph';

export class HybridCallGraphProvider implements CallGraphProvider {
  private readonly native: NodeCallGraphProvider;
  private readonly lsp: VsCodeCallGraphProvider;

  constructor(
    rootPath: string,
    token: vscode.CancellationToken,
    excludeTests: boolean,
    logger?: Logger,
    uriFilter?: UriFilter,
  ) {
    this.native = new NodeCallGraphProvider(rootPath);
    this.lsp = new VsCodeCallGraphProvider(token, excludeTests, logger, uriFilter);
  }

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    // Prefer LSP for TypeScript/JS: the built-in TS language server always
    // provides call hierarchy with better cross-file type resolution.
    // Fall back to native if LSP returns nothing or throws.
    try {
      const lspEdges = await this.lsp.collectCallEdges(maxFiles, rootUri);
      if (lspEdges.length > 0) {
        return lspEdges;
      }
    } catch {
      // LSP unavailable — use native
    }
    return this.native.collectCallEdges(maxFiles, rootUri);
  }
}
```

Update `AnalysisService.analyze()` to construct `HybridCallGraphProvider` instead of `VsCodeCallGraphProvider`.

---

## Testing Strategy

### Unit Tests (Fast, No Subprocesses)

For each parse function, write unit tests using inline strings:

| Test file | What it tests |
|-----------|--------------|
| `symbolsParse.test.ts` (Python) | Valid JSON → correct `FunctionSymbolInfo[]`; empty; malformed JSON |
| `symbolsParse.test.ts` (Java) | PMD XML with/without method attributes; duplicate method handling |
| `callGraphBuild.test.ts` | Two-file fixture; self-calls excluded; cross-file edge; empty result |

### Integration Tests (Subprocess Required)

For spawn-based tests, check for tool availability and skip gracefully:

```typescript
const pythonAvailable = await checkCommandExists('python3');
const describePython = pythonAvailable ? describe : describe.skip;

describePython('PythonSymbolProvider integration', () => {
  it('extracts top-level functions from simple.py', async () => {
    const provider = new PythonSymbolProvider('python3');
    const symbols = await provider.getFunctionSymbols(FIXTURE_PATH);
    expect(symbols.map((s) => s.name)).toContain('top_level');
  });
});
```

This pattern ensures CI passes even in environments where Python/PMD is not installed, while still running the integration tests when the tools are available.

### Regression Tests

After Phase 1c (replacing `VsCodeSymbolProvider`), run the full VS Code extension test suite with a TypeScript workspace and verify:
- Symbol count is unchanged (same or more — Compiler API is stricter)
- F scores are within 5% of previous values
- No new test failures

After Phase 2b (wiring call graph into CLI), run the CLI against a known TypeScript project (e.g., this codebase itself) and verify:
- R > 1 for at least some symbols (dependency amplification is working)
- F scores are higher on average than with R=1 (expected)
- Run time is within acceptable bounds (<30s for 200-file workspace)

---

## Validation Checklist

Use this checklist to confirm each phase is complete before merging.

### Phase 1a: Python symbols

- [ ] `symbolsParse.test.ts` covers valid JSON, empty input, malformed JSON, nested functions
- [ ] `symbolsSpawn.test.ts` covers happy path with `fakeProc` mock
- [ ] Integration test: `simple.py` fixture produces correct symbol names and line numbers
- [ ] `selectionStartLine` is 0-based (not 1-based as Python's `lineno`)
- [ ] Syntax errors in Python files produce `[]`, not a thrown exception

### Phase 1b: Java symbols

- [ ] `symbolsParse.test.ts` covers PMD XML with method attrs, without method attrs, duplicate violations
- [ ] CC=1 methods limitation is documented in JSDoc
- [ ] Symbols from same run as CC (no extra PMD subprocess)

### Phase 1c: VS Code symbol provider replacement

- [ ] `VsCodeSymbolProvider` class is deleted (not just unused)
- [ ] `NativeSymbolProvider` dispatches correctly for all four TS/JS language IDs
- [ ] `NativeSymbolProvider` returns `[]` for unknown language IDs (no throw)
- [ ] VS Code extension test suite passes with no changes to expected symbol counts

### Phase 2a: TypeScript call graph

- [ ] Two-file fixture test passes (cross-file call edge detected)
- [ ] Self-calls (recursive functions) are excluded
- [ ] Duplicate edges are deduplicated
- [ ] Declaration files (`.d.ts`) are excluded
- [ ] Symbol IDs produced by call graph match symbol IDs produced by `NodeSymbolProvider`

### Phase 2b: CLI call graph wiring

- [ ] `runCliAnalysis` returns `edges.length > 0` for a TypeScript project with cross-file calls
- [ ] `cliAnalysis.test.ts` passes with the new provider
- [ ] `nullCallGraphProvider` is deleted

### Phase 2c: VS Code hybrid call graph

- [ ] When LSP returns edges, those are used (not native)
- [ ] When LSP returns empty, native is used
- [ ] When LSP throws, native is used (no error propagated to caller)
- [ ] `HybridCallGraphProvider` is wired into `AnalysisService`
