# Implementation Guide: DDP CLI for GitHub Actions

This guide provides technical specifications for implementing the CLI analysis capability defined in [ADR-001](./ADR-001-cli-analysis-architecture.md).

## Table of Contents

1. [Component Architecture](#component-architecture)
2. [Implementation Sequence](#implementation-sequence)
3. [Node.js Adapters Specification](#nodejs-adapters-specification)
4. [CLI Entry Point](#cli-entry-point)
5. [Output Formatters](#output-formatters)
6. [GitHub Actions Integration](#github-actions-integration)
7. [Testing Strategy](#testing-strategy)

---

## Component Architecture

### Directory Structure

```
src/
  cli/
    adapters/
      nodeDocument.ts         # Implements DocumentProvider
      nodeSymbol.ts           # Implements SymbolProvider (TS Compiler API)
      nodeCallGraph.ts        # Implements CallGraphProvider (stub for MVP)
      nodeCoverage.ts         # Implements CoverageProvider (file parsing)
      nodeLogger.ts           # Implements Logger (console output)
      nodeDocument.test.ts
      nodeSymbol.test.ts
      nodeCoverage.test.ts
    formatters/
      json.ts                 # JSON output format
      githubSummary.ts        # GitHub Actions markdown summary
      json.test.ts
      githubSummary.test.ts
    analyze.ts                # Main CLI entry point
    analyze.test.ts
    types.ts                  # CLI-specific types
  core/                       # Existing domain logic (unchanged)
  ddp/                        # Existing VS Code adapters (unchanged)
```

### Dependency Flow

```
CLI (analyze.ts)
  ↓
NodeAdapters (implements ports)
  ↓
AnalysisOrchestrator (reused)
  ↓
Core Domain (computeSymbolMetrics, computeRanks, etc.)
  ↓
JSON Output
  ↓
Formatters (JSON, GitHub Summary)
```

---

## Implementation Sequence

**Prerequisite:** All existing tests must remain green throughout.

### Step 1: Node Document Provider
**File:** `src/cli/adapters/nodeDocument.ts`

**Test-first approach:**
1. Write test: find TypeScript files in a test fixture directory
2. Write test: exclude test files when configured
3. Write test: open document and provide languageId detection
4. Write test: getText returns correct line range
5. Implement to pass tests

**Dependencies:**
- Node `fs/promises` for file operations
- `glob` package for file discovery (or `fast-glob`)
- MIME type detection from file extension

### Step 2: Node Coverage Provider  
**File:** `src/cli/adapters/nodeCoverage.ts`

**Test-first approach:**
1. Write test: load LCOV file and parse statements
2. Write test: load JaCoCo XML and parse statements
3. Write test: handle missing coverage gracefully
4. Implement by reusing existing parsers (lcovParse, jacocoParse)

**Reuses:**
- `src/core/lcovParse.ts`
- `src/core/jacocoParse.ts`

### Step 3: Node Symbol Provider (TypeScript/JavaScript)
**File:** `src/cli/adapters/nodeSymbol.ts`

**Test-first approach:**
1. Write test: extract function declarations from TS file
2. Write test: extract method declarations from class
3. Write test: extract arrow functions in objects
4. Write test: compute correct line ranges (body start/end)
5. Implement using TypeScript Compiler API

**TypeScript Compiler API approach:**
```typescript
import * as ts from 'typescript';

function extractFunctions(sourceFile: ts.SourceFile): FunctionSymbolInfo[] {
  const functions: FunctionSymbolInfo[] = [];
  
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || 
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node)) {
      
      const name = node.name?.getText(sourceFile) || '<anonymous>';
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const body = getFunctionBody(node);
      const bodyStart = sourceFile.getLineAndCharacterOfPosition(body.getStart());
      const bodyEnd = sourceFile.getLineAndCharacterOfPosition(body.getEnd());
      
      functions.push({
        name,
        selectionStartLine: start.line,
        selectionStartCharacter: start.character,
        bodyStartLine: bodyStart.line,
        bodyEndLine: bodyEnd.line,
      });
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return functions;
}
```

### Step 4: Node Call Graph Provider (Stub)
**File:** `src/cli/adapters/nodeCallGraph.ts`

**MVP implementation:**
```typescript
export class NodeCallGraphProvider implements CallGraphProvider {
  async collectCallEdges(): Promise<CallEdge[]> {
    return []; // No edges = all ranks default to 1
  }
}
```

**Future enhancement** (Phase 2):
- Parse function calls using TS compiler API
- Build caller → callee edges
- Handle imports and cross-file references

### Step 5: CLI Entry Point
**File:** `src/cli/analyze.ts`

**Test-first approach:**
1. Write test: parse CLI arguments correctly
2. Write test: wire adapters to orchestrator
3. Write test: handle cancellation signals (SIGINT)
4. Write test: output JSON to stdout or file
5. Implement CLI orchestration

**CLI Interface:**
```bash
ddp-analyze [options]

Options:
  --root <path>           Workspace root directory (default: cwd)
  --config <path>         Config file path (default: .ddprc.json)
  --output <path>         Output file (default: stdout)
  --format <type>         Output format: json|github-summary (default: json)
  --max-files <n>         Max files to analyze (default: 1000)
  --exclude-tests         Exclude test files (default: true)
  --lcov-glob <pattern>   LCOV file glob (default: **/coverage/lcov.info)
  --jacoco-glob <pattern> JaCoCo file glob (default: **/target/site/jacoco/jacoco.xml)
  --verbose               Enable verbose logging
```

**Implementation sketch:**
```typescript
import { Command } from 'commander';
import { AnalysisOrchestrator } from '../ddp/analysisOrchestrator';
import { NodeDocumentProvider } from './adapters/nodeDocument';
// ... other adapters

async function main() {
  const program = new Command();
  program
    .name('ddp-analyze')
    .description('Analyze code risk using Dependable Dependencies principle')
    .option('--root <path>', 'Workspace root', process.cwd())
    .option('--output <path>', 'Output file')
    .option('--format <type>', 'Output format', 'json')
    // ... other options
    .parse();

  const options = program.opts();
  
  // Build configuration
  const config = buildConfigFromOptions(options);
  
  // Wire adapters
  const orchestrator = new AnalysisOrchestrator({
    documentProvider: new NodeDocumentProvider(config),
    symbolProvider: new NodeSymbolProvider(),
    callGraphProvider: new NodeCallGraphProvider(),
    coverageProvider: new NodeCoverageProvider(config),
    ccRegistry: buildCcRegistry(config),
    logger: new NodeLogger(options.verbose),
  });
  
  // Run analysis
  const result = await orchestrator.analyze(config, { 
    isCancelled: () => false // TODO: wire SIGINT
  });
  
  if (!result) {
    console.error('Analysis failed or was cancelled');
    process.exit(1);
  }
  
  // Format output
  const formatter = getFormatter(options.format);
  const output = formatter.format(result, config);
  
  if (options.output) {
    await fs.writeFile(options.output, output, 'utf-8');
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

### Step 6: JSON Formatter
**File:** `src/cli/formatters/json.ts`

**Test-first approach:**
1. Write test: format empty result
2. Write test: format result with symbols
3. Write test: include summary statistics
4. Write test: convert URIs to relative paths
5. Implement formatter

**Output schema** (see ADR-001 for full schema).

### Step 7: GitHub Actions Summary Formatter
**File:** `src/cli/formatters/githubSummary.ts`

**Test-first approach:**
1. Write test: generate markdown table header
2. Write test: format file rows with metrics
3. Write test: add sortable JavaScript
4. Write test: add color coding for risk levels
5. Write test: add expandable symbol details
6. Implement formatter

**Output format:**
````markdown
# DDP Analysis Report

## Summary
- **Files Analyzed:** 45
- **Symbols Analyzed:** 423
- **Average CC:** 3.2
- **Average Coverage:** 78%

## Files by Risk

<details open>
<summary><strong>Top 20 Riskiest Files</strong></summary>

<table id="ddp-files">
<thead>
  <tr>
    <th onclick="sortTable(0)">File ⇅</th>
    <th onclick="sortTable(1)">Max F' ⇅</th>
    <th onclick="sortTable(2)">Avg CC ⇅</th>
    <th onclick="sortTable(3)">Avg Cov ⇅</th>
    <th onclick="sortTable(4)">Symbols ⇅</th>
  </tr>
</thead>
<tbody>
  <tr class="risk-high">
    <td><a href="src/complex.ts">src/complex.ts</a></td>
    <td>45.2</td>
    <td>12.3</td>
    <td>45%</td>
    <td>8</td>
  </tr>
  <!-- more rows -->
</tbody>
</table>

<script>
function sortTable(col) {
  const table = document.getElementById('ddp-files');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = tbody.dataset.sortDir === 'asc' ? 'desc' : 'asc';
  
  rows.sort((a, b) => {
    const aVal = parseFloat(a.cells[col].textContent) || a.cells[col].textContent;
    const bVal = parseFloat(b.cells[col].textContent) || b.cells[col].textContent;
    return dir === 'asc' 
      ? (aVal > bVal ? 1 : -1)
      : (aVal < bVal ? 1 : -1);
  });
  
  tbody.innerHTML = '';
  rows.forEach(row => tbody.appendChild(row));
  tbody.dataset.sortDir = dir;
}
</script>

<style>
.risk-high td { background-color: #ffdddd; }
.risk-medium td { background-color: #ffffdd; }
.risk-low td { background-color: #ddffdd; }
th { cursor: pointer; user-select: none; }
</style>

</details>

<details>
<summary><strong>Top Riskiest Symbols</strong></summary>

| Symbol | File | F' | CC | Coverage |
|--------|------|----|----|----------|
| `processLargeDataset` | src/complex.ts:45 | 45.2 | 15 | 30% |
| `handleAllCases` | src/handler.ts:120 | 38.1 | 12 | 50% |
<!-- more rows -->

</details>
````

### Step 8: GitHub Actions Workflow Integration
**File:** `.github/workflows/ddp-analysis.yml`

```yaml
name: DDP Risk Analysis

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Need git history for churn analysis
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests with coverage
        run: npm run test:coverage
      
      - name: Run DDP Analysis
        run: |
          npm run compile
          node out/cli/analyze.js \
            --format github-summary \
            --output ddp-report.md \
            --verbose
      
      - name: Add to GitHub Summary
        if: always()
        run: cat ddp-report.md >> $GITHUB_STEP_SUMMARY
      
      - name: Upload analysis artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ddp-analysis
          path: |
            ddp-report.md
            ddp-analysis.json
```

---

## Node.js Adapters Specification

### NodeDocumentProvider

**Responsibilities:**
- Find source files matching glob patterns
- Exclude test files based on naming conventions  
- Read file contents
- Detect language ID from file extension

**Interface implementation:**
```typescript
export class NodeDocumentProvider implements DocumentProvider {
  constructor(
    private readonly rootPath: string,
    private readonly excludeTests: boolean = true
  ) {}

  async findSourceFiles(maxFiles: number, rootUri?: string): Promise<string[]> {
    const pattern = '**/*.{ts,tsx,js,jsx,py,java}';
    const exclude = [
      '**/node_modules/**',
      '**/out/**', 
      '**/dist/**',
      '**/.git/**'
    ];
    
    const files = await glob(pattern, {
      cwd: rootUri ? URI.parse(rootUri).fsPath : this.rootPath,
      ignore: exclude,
      absolute: true,
    });
    
    let result = files.map(f => URI.file(f).toString());
    
    if (this.excludeTests) {
      result = result.filter(uri => !isTestFileUri(uri));
    }
    
    return result.slice(0, maxFiles);
  }

  async openDocument(uri: string): Promise<DocumentInfo | undefined> {
    const fsPath = URI.parse(uri).fsPath;
    try {
      const content = await fs.readFile(fsPath, 'utf-8');
      const lines = content.split('\n');
      const ext = path.extname(fsPath);
      
      return {
        uri,
        languageId: getLanguageId(ext),
        getText(startLine: number, endLine: number): string {
          return lines.slice(startLine, endLine + 1).join('\n');
        },
      };
    } catch (err) {
      return undefined;
    }
  }
}

function getLanguageId(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.java': 'java',
  };
  return map[ext] || 'plaintext';
}
```

### NodeSymbolProvider

**Responsibilities:**
- Extract function/method symbols from TypeScript/JavaScript files
- Compute accurate line ranges for symbol bodies
- Handle various function syntaxes (declarations, expressions, arrows, methods)

**TypeScript AST traversal:**
```typescript
export class NodeSymbolProvider implements SymbolProvider {
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const fsPath = URI.parse(uri).fsPath;
    const ext = path.extname(fsPath);
    
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return []; // Only TS/JS for MVP
    }
    
    const content = await fs.readFile(fsPath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      fsPath,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    
    return this.extractFunctions(sourceFile);
  }

  private extractFunctions(sourceFile: ts.SourceFile): FunctionSymbolInfo[] {
    const functions: FunctionSymbolInfo[] = [];
    
    const visit = (node: ts.Node) => {
      let name: string | undefined;
      let bodyNode: ts.Node | undefined;
      
      if (ts.isFunctionDeclaration(node)) {
        name = node.name?.getText(sourceFile);
        bodyNode = node.body;
      } else if (ts.isMethodDeclaration(node)) {
        name = node.name.getText(sourceFile);
        bodyNode = node.body;
      } else if (ts.isArrowFunction(node) && node.parent) {
        // Try to get name from parent context (const foo = () => {})
        if (ts.isVariableDeclaration(node.parent)) {
          name = node.parent.name.getText(sourceFile);
        }
        bodyNode = node.body;
      }
      
      if (name && bodyNode) {
        const selectionPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const bodyStartPos = sourceFile.getLineAndCharacterOfPosition(bodyNode.getStart());
        const bodyEndPos = sourceFile.getLineAndCharacterOfPosition(bodyNode.getEnd());
        
        functions.push({
          name,
          selectionStartLine: selectionPos.line,
          selectionStartCharacter: selectionPos.character,
          bodyStartLine: bodyStartPos.line,
          bodyEndLine: bodyEndPos.line,
        });
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    return functions;
  }
}
```

### NodeCoverageProvider

**Responsibilities:**
- Locate and parse LCOV/JaCoCo coverage files
- Convert to StatementCover format
- Handle missing coverage gracefully

**Implementation:**
```typescript
export class NodeCoverageProvider implements CoverageProvider {
  private coverageMap = new Map<string, StatementCover[]>();
  
  constructor(
    private readonly rootPath: string,
    private readonly lcovGlob: string,
    private readonly jacocoGlob: string
  ) {}

  async loadCoverage(): Promise<void> {
    this.coverageMap.clear();
    
    // Load LCOV
    const lcovFiles = await glob(this.lcovGlob, { 
      cwd: this.rootPath,
      absolute: true 
    });
    
    for (const file of lcovFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = parseLcov(content);
      
      for (const [filePath, statements] of parsed.entries()) {
        const uri = URI.file(path.resolve(this.rootPath, filePath)).toString();
        this.coverageMap.set(uri, statements);
      }
    }
    
    // Load JaCoCo (similar pattern)
    const jacocoFiles = await glob(this.jacocoGlob, {
      cwd: this.rootPath,
      absolute: true
    });
    
    for (const file of jacocoFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = parseJacoco(content);
      
      for (const [filePath, statements] of parsed.entries()) {
        const uri = URI.file(path.resolve(this.rootPath, filePath)).toString();
        this.coverageMap.set(uri, statements);
      }
    }
  }

  getStatements(uri: string): StatementCover[] | undefined {
    return this.coverageMap.get(uri);
  }
}
```

---

## Testing Strategy

### Unit Tests

Each adapter should have comprehensive unit tests:

1. **NodeDocumentProvider tests:**
   - File discovery with various globs
   - Test file exclusion
   - Document opening and text extraction
   - Language ID detection
   - Error handling (missing files)

2. **NodeSymbolProvider tests:**
   - Function declaration extraction
   - Method extraction (class and object)
   - Arrow function extraction
   - Line range accuracy
   - Edge cases (nested functions, generators, async)

3. **NodeCoverageProvider tests:**
   - LCOV parsing and mapping
   - JaCoCo parsing and mapping
   - Missing coverage handling
   - URI normalization

4. **Formatter tests:**
   - JSON schema validation
   - Markdown generation
   - Table sorting logic
   - Color coding thresholds

### Integration Tests

Test end-to-end CLI in src/cli/analyze.test.ts:

1. **Full analysis run:**
   - Prepare fixture workspace (small TS project)
   - Run analysis
   - Validate JSON output schema
   - Compare results with expected metrics

2. **Configuration variants:**
   - With/without coverage
   - With/without test exclusion
   - Different output formats

### Validation Strategy

**Comparison test:** Run same codebase through both VS Code extension and CLI, compare results:
- Same symbol count
- Same CC values (within tolerance)
- Same coverage fractions
- Same CRAP scores
- Same file rollup (when using R=1 in both)

---

## Configuration File Support

**File:** `.ddprc.json` (workspace root)

```json
{
  "maxFiles": 1000,
  "excludeTests": true,
  "coverage": {
    "lcovGlob": "**/coverage/lcov.info",
    "jacocoGlob": "**/target/site/jacoco/jacoco.xml"
  },
  "cc": {
    "useEslintForTsJs": true,
    "eslintPath": "node_modules/.bin/eslint",
    "pythonPath": "python3",
    "pmdPath": "pmd"
  },
  "rank": {
    "maxIterations": 100,
    "epsilon": 0.001
  },
  "fileRollup": "max",
  "churn": {
    "enabled": true,
    "lookbackDays": 90
  }
}
```

Load configuration:
```typescript
function loadConfig(rootPath: string, configPath?: string): DdpConfiguration {
  const defaultConfig = getDefaultConfiguration();
  
  const rcPath = configPath || path.join(rootPath, '.ddprc.json');
  if (!fs.existsSync(rcPath)) {
    return defaultConfig;
  }
  
  const userConfig = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
  return deepMerge(defaultConfig, userConfig);
}
```

---

## Performance Considerations

### Expected Performance Targets

- **500 files, 5000 symbols:** <30 seconds
- **Memory usage:** <500MB
- **Incremental analysis:** Future enhancement (cache parsed ASTs)

### Optimization Opportunities

1. **Parallel file processing:** Use worker threads for symbol extraction
2. **AST caching:** Cache parsed TypeScript ASTs between runs
3. **Coverage pre-filtering:** Only load coverage for files being analyzed
4. **Streaming output:** Write results progressively for large workspaces

---

## Appendix: TypeScript Compiler API Quick Reference

```typescript
import * as ts from 'typescript';

// Parse a file
const sourceFile = ts.createSourceFile(
  'file.ts',
  content,
  ts.ScriptTarget.Latest,
  /*setParentNodes*/ true
);

// Traverse AST
function visit(node: ts.Node) {
  // Check node type
  if (ts.isFunctionDeclaration(node)) {
    const name = node.name?.getText(sourceFile);
    const params = node.parameters.map(p => p.name.getText(sourceFile));
  }
  
  // Recurse
  ts.forEachChild(node, visit);
}

// Get position info
const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
console.log(`Line ${pos.line}, Column ${pos.character}`);

// Common node type checks
ts.isFunctionDeclaration(node)
ts.isMethodDeclaration(node)
ts.isArrowFunction(node)
ts.isCallExpression(node)
ts.isClassDeclaration(node)
ts.isVariableDeclaration(node)
```

---

## Next Steps

1. **Review and approve ADR-001**
2. **Create GitHub issue/epic** for tracking implementation
3. **Assign to software-engineer agent** for TDD implementation
4. **Start with Step 1** (NodeDocumentProvider) following Red-Green-Refactor
5. **Iterate through steps 2-8** maintaining test coverage >95%
6. **Document CLI usage** in README.md
7. **Add example workflow** to repo

---

**Questions or concerns?** Discuss in ADR-001 or create a discussion thread before implementation begins.
