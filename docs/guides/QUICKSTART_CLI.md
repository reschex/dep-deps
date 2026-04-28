# Quick Start: Implementing DDP CLI for GitHub Actions

This is a condensed guide for getting started with implementation. For full details, see [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) and [IMPLEMENTATION_GUIDE_CLI.md](./IMPLEMENTATION_GUIDE_CLI.md).

## 🎯 Goal

Enable DDP risk analysis to run in GitHub Actions CI/CD with sortable summary tables showing file-level risk metrics.

## 📋 Prerequisites

- [ ] Read [ADR-001](./ADR-001-cli-analysis-architecture.md)
- [ ] Review [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md)
- [ ] Understand existing ports/adapters architecture

## 🚀 Implementation Steps

### Step 1: Setup Dependencies (5 minutes)

```bash
npm install --save commander glob
npm install --save-dev @types/glob
```

Update package.json (see [PACKAGE_JSON_CHANGES.md](./PACKAGE_JSON_CHANGES.md)):
- Add `bin` entry
- Add CLI scripts

### Step 2: Create Directory Structure (2 minutes)

```bash
mkdir -p src/cli/adapters
mkdir -p src/cli/formatters
```

### Step 3: Implement Node.js Adapters (4-6 hours)

**Test-first! Red → Green → Refactor**

#### 3a. NodeDocumentProvider
```typescript
// src/cli/adapters/nodeDocument.test.ts
import { NodeDocumentProvider } from './nodeDocument';

describe('NodeDocumentProvider', () => {
  it('should find TypeScript files', async () => {
    const provider = new NodeDocumentProvider('/path/to/test-fixture');
    const files = await provider.findSourceFiles(100);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toContain('.ts');
  });
  
  // More tests...
});
```

Then implement to pass tests in `src/cli/adapters/nodeDocument.ts`.

#### 3b. NodeCoverageProvider
Reuse existing parsers:
```typescript
// src/cli/adapters/nodeCoverage.ts
import { parseLcov } from '../../core/lcovParse';
import { parseJacoco } from '../../core/jacocoParse';
```

Write tests first, then implement.

#### 3c. NodeSymbolProvider
Use TypeScript Compiler API:
```typescript
// src/cli/adapters/nodeSymbol.ts
import * as ts from 'typescript';

export class NodeSymbolProvider implements SymbolProvider {
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    // Use ts.createSourceFile and traverse AST
  }
}
```

#### 3d. NodeCallGraphProvider (Stub for MVP)
```typescript
// src/cli/adapters/nodeCallGraph.ts
export class NodeCallGraphProvider implements CallGraphProvider {
  async collectCallEdges(): Promise<CallEdge[]> {
    return []; // No call graph = all R=1
  }
}
```

### Step 4: Implement CLI Entry Point (2-3 hours)

```typescript
// src/cli/analyze.ts
import { Command } from 'commander';
import { AnalysisOrchestrator } from '../ddp/analysisOrchestrator';
import { buildConfiguration } from '../ddp/configuration';

async function main() {
  const program = new Command();
  
  program
    .name('ddp-analyze')
    .description('Analyze code risk using Dependable Dependencies')
    .option('--root <path>', 'Workspace root', process.cwd())
    .option('--format <type>', 'Output format (json|github-summary)', 'json')
    .option('--output <path>', 'Output file (default: stdout)')
    .option('--verbose', 'Verbose logging')
    .parse();

  const opts = program.opts();
  
  // Wire up adapters
  const orchestrator = new AnalysisOrchestrator({
    documentProvider: new NodeDocumentProvider(opts.root),
    symbolProvider: new NodeSymbolProvider(),
    callGraphProvider: new NodeCallGraphProvider(),
    coverageProvider: new NodeCoverageProvider(opts.root),
    ccRegistry: buildCcRegistry(),
    logger: new NodeLogger(opts.verbose),
  });
  
  // Run analysis
  const config = loadConfig(opts.root);
  const result = await orchestrator.analyze(config, { 
    isCancelled: () => false 
  });
  
  // Format and output
  const formatter = getFormatter(opts.format);
  const output = formatter.format(result);
  
  if (opts.output) {
    await fs.writeFile(opts.output, output);
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

### Step 5: Implement Output Formatters (3-4 hours)

#### 5a. JSON Formatter
```typescript
// src/cli/formatters/json.ts
export function formatJson(result: AnalysisResult): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      filesAnalyzed: result.fileRollup.size,
      symbolsAnalyzed: result.symbols.length,
      // ...
    },
    files: buildFileRisks(result),
  }, null, 2);
}
```

#### 5b. GitHub Summary Formatter
```typescript
// src/cli/formatters/githubSummary.ts
export function formatGithubSummary(result: AnalysisResult): string {
  const md = [];
  
  md.push('# DDP Analysis Report\n');
  md.push('## Summary\n');
  md.push(`- **Files:** ${result.fileRollup.size}`);
  // ...
  
  md.push('\n## Top Risky Files\n');
  md.push(generateSortableTable(result));
  
  return md.join('\n');
}

function generateSortableTable(result: AnalysisResult): string {
  return `
<table id="ddp-files">
  <thead>
    <tr>
      <th onclick="sortTable(0)">File ⇅</th>
      <th onclick="sortTable(1)">Max F' ⇅</th>
      <!-- ... -->
    </tr>
  </thead>
  <tbody>
    ${generateTableRows(result)}
  </tbody>
</table>
<script>${sortingScript}</script>
<style>${colorCodingStyles}</style>
`;
}
```

### Step 6: Create GitHub Actions Workflow (30 minutes)

```yaml
# .github/workflows/ddp-analysis.yml
name: DDP Risk Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      
      - run: npm ci
      - run: npm run compile
      - run: npm run test:coverage
      
      - name: Run DDP Analysis
        run: |
          npm run cli -- \
            --format github-summary \
            --output ddp-report.md
      
      - name: Add to Summary
        if: always()
        run: cat ddp-report.md >> $GITHUB_STEP_SUMMARY
      
      - uses: actions/upload-artifact@v4
        with:
          name: ddp-analysis
          path: ddp-report.md
```

### Step 7: Test End-to-End (1 hour)

```bash
# Local test
npm run compile
npm run cli:example

# Verify output
ls -la ddp-report.md

# Commit and push to trigger CI
git add .
git commit -m "feat: Add DDP CLI for GitHub Actions"
git push
```

Check GitHub Actions summary page for sortable table!

## 📊 Expected Output

**GitHub Actions Summary:**

```
┌─────────────────────────────────────────────────┐
│          DDP Analysis Report                     │
├─────────────────────────────────────────────────┤
│ Files Analyzed: 45                               │
│ Symbols Analyzed: 423                            │
│ Average CC: 3.2                                  │
│ Average Coverage: 78%                            │
└─────────────────────────────────────────────────┘

Top Risky Files (sortable table):
┌────────────────────┬────────┬────────┬──────────┐
│ File               │ Max F' │ Avg CC │ Coverage │
├────────────────────┼────────┼────────┼──────────┤
│ src/complex.ts     │ 45.2   │ 12.3   │ 45%     │ ← Red
│ src/legacy.ts      │ 18.5   │ 8.1    │ 60%     │ ← Yellow
│ src/utils.ts       │ 5.2    │ 3.0    │ 95%     │ ← Green
└────────────────────┴────────┴────────┴──────────┘
(Click column headers to sort)
```

## ✅ Success Criteria

- [ ] `npm run cli -- --help` shows usage
- [ ] `npm run cli:json` generates valid JSON
- [ ] `npm run cli:example` generates markdown with table
- [ ] GitHub Actions workflow runs without errors
- [ ] Summary page shows sortable table
- [ ] Color coding works (red/yellow/green)
- [ ] Test coverage remains >95%
- [ ] Existing VS Code extension still works

## 🐛 Troubleshooting

**Issue:** "Cannot find module 'commander'"
```bash
npm install commander
```

**Issue:** "No symbols found"
- Check file extensions (.ts, .js supported in MVP)
- Verify file paths are correct
- Run with `--verbose` flag

**Issue:** "No coverage data"
- Run `npm run test:coverage` first
- Check LCOV path: `**/coverage/lcov.info`
- Coverage is optional (analysis continues with T=0)

**Issue:** GitHub Actions summary not showing
- Check `$GITHUB_STEP_SUMMARY` is set (only in Actions)
- Verify markdown is valid
- Check file was created: `cat ddp-report.md`

## 📚 Resources

- **Architecture:** [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md)
- **Implementation Details:** [IMPLEMENTATION_GUIDE_CLI.md](./IMPLEMENTATION_GUIDE_CLI.md)
- **Decisions:** [ADR-001](./ADR-001-cli-analysis-architecture.md)
- **Package Changes:** [PACKAGE_JSON_CHANGES.md](./PACKAGE_JSON_CHANGES.md)
- **Example Workflow:** [.github/workflows/ddp-analysis-example.yml](./.github/workflows/ddp-analysis-example.yml)

## 🚦 Next Steps

1. **Review architecture docs** (30 min)
2. **Implement adapters** (4-6 hours, TDD)
3. **Implement CLI** (2-3 hours, TDD)
4. **Implement formatters** (3-4 hours, TDD)
5. **Test locally** (1 hour)
6. **Deploy to CI** (30 min)
7. **Document in README** (1 hour)

**Total estimated time:** 12-15 hours for MVP

## 🎓 Learning Path

**New to Ports/Adapters?**
- Read `src/core/ports.ts`
- See `src/ddp/adapters.ts` for examples
- Pattern: Interface → VS Code impl → Node.js impl

**New to TypeScript Compiler API?**
- See [Implementation Guide](./IMPLEMENTATION_GUIDE_CLI.md#appendix-typescript-compiler-api-quick-reference)
- Example: `ts.createSourceFile()`, `ts.forEachChild()`

**New to GitHub Actions Summaries?**
- [GitHub Docs](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary)
- Write markdown to `$GITHUB_STEP_SUMMARY`

---

**Questions?** Open a discussion or ping the architect agent.

**Ready to code?** Start with `src/cli/adapters/nodeDocument.test.ts` (TDD!)
