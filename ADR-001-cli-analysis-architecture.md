# ADR-001: CLI Analysis Architecture for GitHub Actions

**Status:** Proposed  
**Date:** 2026-04-27  
**Decision Makers:** Architect  

## Context

The DDP extension currently runs only within VS Code, using VS Code APIs for:
- File discovery (workspace.findFiles)
- Symbol extraction (LSP document symbols)
- Call graph construction (LSP call hierarchy)
- Document access (workspace.openTextDocument)

To enable GitHub Actions analysis with summary tables, we need headless execution that produces machine-readable output.

## Decision

Create a **parallel CLI execution path** that:

1. **Reuses existing domain logic** (`AnalysisOrchestrator`, metrics, ranking algorithms)
2. **Implements Node.js adapters** for port interfaces (no VS Code dependency)
3. **Uses simplified adapters where LSP is unavailable**:
   - TypeScript Compiler API for TS/JS symbol extraction and call graphs
   - File system access for coverage files
   - Fallback to estimated CC when external tools unavailable
4. **Outputs structured JSON** for consumption by formatters
5. **Provides GitHub Actions summary formatter** with sortable HTML tables

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DDP Core Domain                          │
│  AnalysisOrchestrator │ computeSymbolMetrics │ computeRanks │
│  (infrastructure-agnostic, already tested)                  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ ports (interfaces)
          ┌─────────────────┴─────────────────┐
          │                                   │
┌─────────────────────┐          ┌───────────────────────┐
│   VS Code Adapters  │          │   Node.js Adapters     │
│  (existing)         │          │   (new)                │
├─────────────────────┤          ├───────────────────────┤
│ VsCodeDocProvider   │          │ NodeDocumentProvider  │
│ VsCodeSymbolProvider│          │ NodeSymbolProvider    │
│ VsCodeCallGraph...  │          │ NodeCallGraph...      │
│ VsCodeCoverage...   │          │ NodeCoverage...       │
└─────────────────────┘          └───────────────────────┘
          │                                   │
          ▼                                   ▼
┌─────────────────────┐          ┌───────────────────────┐
│  VS Code Extension  │          │   CLI Runner          │
│  (UI commands)      │          │   (JSON output)       │
└─────────────────────┘          └───────────────────────┘
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  GitHub Actions       │
                                  │  Summary Formatter    │
                                  │  (Markdown + HTML)    │
                                  └───────────────────────┘
```

## Technical Decisions

### 1. Symbol Extraction Strategy

**For TypeScript/JavaScript:**
- Use TypeScript Compiler API (`ts.createProgram`, `ts.forEachChild`)
- Extract function/method declarations with line ranges
- Extract function calls for call graph
- **Justification**: Most accurate, already a dependency, no external process

**For Python/Java:**
- Phase 1: Skip or use file-level only (no symbol extraction)
- Phase 2: Shell out to existing tools (tree-sitter, javaparser)
- **Justification**: MVP focuses on TS/JS (primary codebase language)

### 2. Call Graph Strategy

**Option A (Recommended for MVP):** Simplified ranking
- All symbols get R=1 (no call graph)
- F = 1 × CRAP = CRAP
- File ranking still useful (sorts by CRAP)
- **Pros**: Simple, fast, 80% value
- **Cons**: Misses dependency amplification

**Option B (Full implementation):**
- Parse TS/JS call graphs using compiler API
- Build call edges, compute PageRank
- **Pros**: Complete F = R × CRAP metric
- **Cons**: Complex, requires full dependency analysis

**Decision**: Start with Option A, architecture supports upgrading to Option B

### 3. Coverage Integration

**Approach**: Direct file parsing (already implemented in adapters)
- Read LCOV files via `lcovParse.ts` (existing)
- Read JaCoCo XML via `jacocoParse.ts` (existing)
- Map to symbols using line ranges
- **Justification**: No VS Code API needed, already tested

### 4. Output Format

**JSON Schema** (analysis-output.json):
```json
{
  "timestamp": "2026-04-27T10:30:00Z",
  "config": {
    "maxFiles": 1000,
    "excludeTests": true,
    "coverage": { "lcovGlob": "**/coverage/lcov.info" }
  },
  "summary": {
    "filesAnalyzed": 45,
    "symbolsAnalyzed": 423,
    "edgesCount": 0,
    "averageCC": 3.2,
    "averageCoverage": 0.78
  },
  "files": [
    {
      "uri": "file:///workspace/src/foo.ts",
      "path": "src/foo.ts",
      "rollupScore": 12.5,
      "symbols": [
        {
          "id": "file:///workspace/src/foo.ts#L10:processData",
          "name": "processData",
          "line": 10,
          "cc": 8,
          "t": 0.5,
          "crap": 10.5,
          "r": 1.0,
          "f": 10.5,
          "g": 1.0,
          "fPrime": 10.5
        }
      ]
    }
  ]
}
```

**GitHub Actions Summary** (markdown with embedded HTML):
- Sortable HTML table (using `<table>` with JavaScript)
- Columns: File, Max F', Avg CC, Coverage, Symbol Count
- Expandable details per file (top 5 riskiest symbols)
- Color coding: red (F' > 20), yellow (F' > 10), green (F' ≤ 10)

### 5. Deployment Model

**Package structure:**
```
src/
  core/           # domain logic (unchanged)
  ddp/            # VS Code adapters (unchanged)
  cli/            # new CLI infrastructure
    adapters/
      nodeDocument.ts
      nodeSymbol.ts
      nodeCoverage.ts
      nodeLogger.ts
    analyze.ts    # CLI entry point
    formatGithubSummary.ts
    formatJson.ts
package.json      # add "bin" entry for CLI
```

**Distribution:**
- Same npm package, dual-purpose (extension + CLI)
- Add `"bin": { "ddp-analyze": "./out/cli/analyze.js" }`
- GitHub Actions can `npm install` the package to get CLI

## Consequences

### Positive
- **Reuses battle-tested domain logic** (no duplication)
- **CI/CD visibility** into code risk trends over time
- **Pull request comments** showing risk delta possible
- **Architecture validates ports/adapters design** (proves decoupling works)
- **Future-proof**: Easy to add more output formats (SARIF, JSON Schema, etc.)

### Negative
- **Maintenance burden** of two adapter sets (VS Code + Node.js)
- **Limited language support initially** (TS/JS only for MVP)
- **Simplified ranking** may miss important dependencies (if using Option A)

### Neutral
- **Git churn analysis** requires git in CI (already available in GitHub Actions)

## Alternatives Considered

### Alternative 1: VS Code Headless Mode
Run `code --extensionDevelopmentPath` in CI to use VS Code adapters.

**Rejected because:**
- Heavy CI dependency (requires X11 or Xvfb)
- Slow startup time (~15-30s)
- Fragile (extension host crashes)

### Alternative 2: Separate CLI Tool
Build completely separate tool with duplicated logic.

**Rejected because:**
- Violates DRY principle
- Maintenance nightmare (two implementations drift apart)
- Current architecture already designed for this via ports

### Alternative 3: GitHub Action Wrapper
Pre-built Docker action that runs analysis.

**Deferred until after CLI exists:**
- Good "Phase 2" feature for ease of use
- Requires CLI foundation first

## Implementation Phases

### Phase 1: MVP (TypeScript/JavaScript, simplified ranking)
- [ ] Node.js document provider (fs-based)
- [ ] Node.js symbol provider (TS compiler API)
- [ ] Node.js coverage provider (direct file parsing)
- [ ] Skip call graph (R=1 for all symbols)
- [ ] CLI entry point with JSON output
- [ ] GitHub Actions summary formatter
- [ ] Workflow integration example

### Phase 2: Full Call Graph
- [ ] Node.js call graph provider (TS compiler API)
- [ ] Proper R calculation via PageRank
- [ ] Validate against VS Code extension results

### Phase 3: Multi-Language
- [ ] Python symbol extraction (tree-sitter or ast module)
- [ ] Java symbol extraction (javaparser or tree-sitter)
- [ ] Language-specific call graph analysis

### Phase 4: GitHub Action Package
- [ ] Docker-based GitHub Action
- [ ] Auto-comment on PRs with risk delta
- [ ] Fail builds on risk threshold breach

## Metrics for Success

1. **Accuracy**: CLI results match VS Code extension (when using same adapters)
2. **Performance**: Analysis completes in <30s for 500-file workspace
3. **Usability**: GitHub Actions summary table is sortable and readable
4. **Adoption**: Can be integrated into CI in <10 lines of workflow YAML

## References

- Hexagonal Architecture (Ports & Adapters): Alistair Cockburn
- Dependable Dependencies: Jason Gorman (2011)
- CRAP Metric: Alberto Savoia
- TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- GitHub Actions Job Summaries: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
