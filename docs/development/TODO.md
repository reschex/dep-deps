# DDP Development TODO

## Impact Tree Visualization (ADR-003) - Caller Dependency Analysis

**Status**: ✅ MVP Complete (2026-04-28)  
**Docs**: [ADR-003](../architecture/ADR-003-call-graph-visualization.md), [Implementation Guide](../guides/IMPLEMENTATION_GUIDE_CALL_GRAPH.md)

**Focus**: Show who calls a symbol (direct and indirect callers) to understand impact radius of changes. Callees are NOT shown as they are irrelevant for impact analysis.

### Phase 1: Core Domain Logic (TDD) ✅
- [x] Create `src/core/callerTree.ts` with caller indexing (implemented as `buildCallerIndex`)
  - [x] Tests for empty edges
  - [x] Tests for indexing callers by callee
- [x] Implement `callerTree()` for impact analysis
  - [x] Tests for single-level caller trees
  - [x] Tests for multi-level caller trees (transitive dependencies)
  - [x] Tests for cycle detection (mutual/recursive calls)
  - [x] Tests for maxDepth limiting
- [x] Implement impact summary metrics
  - [x] Count direct callers
  - [x] Count total affected symbols (all depths)
  - [x] Find highest-risk caller (integrated into `flattenTree`)
- [x] Update `AnalysisResult` type to include `edges: ReadonlyArray<CallEdge>`
- [x] Update `AnalysisOrchestrator` to preserve edges in result
- [x] Update all test fixtures to include edges

### Phase 2: VS Code UI (Lightweight MVP) ✅
- [x] Create `src/adapter/vscode/impactTreeCommand.ts`
  - [x] Tests with no analysis
  - [x] Tests with symbol not found
  - [x] Tests with no callers (entry point)
  - [x] Tests with multi-level caller hierarchy
  - [x] Tests showing impact summary
- [x] Register `ddp.showImpactTree` command in `register.ts`
- [x] Add context menu to Risk Tree View for symbols
- [x] Update `package.json` contributions (menus, commands)
- [x] Set `contextValue = "ddpSymbol"` on symbol tree items

**Notes**:  
- Implementation uses `callerTree.ts` (domain logic) + `impactTreeCommand.ts` (VS Code adapter)
- Fixed: "R is always 1" defect - LSP call graph now uses `vscode.commands.executeCommand` API instead of direct language API (2026-04-28)
- Improved test quality: removed unsafe non-null assertions, fixed magic index access patterns

### Phase 3: CLI Output
- [x] Create `src/core/formatImpactTree.ts` for text/ASCII tree formatting (LLM-optimised)
  - [x] Tests for empty caller trees (entry points)
  - [x] Tests for single/multi-level formatting with depth indicators
  - [x] Tests for recursive caller markers
  - [x] Tests for impact summary formatting
- [x] Add `ddp callers` sub-command: `--file`, `--symbol`, `--depth`, `--format json|text`
- [x] `CallersResult` JSON schema: `{ symbol, file, metrics, riskLevel, impactSummary, callerTree }`
- [x] Risk level classification: LOW (F≤50) / MEDIUM (50–200) / HIGH (200–500) / CRITICAL (F>500)
- [x] Text serialiser — indented plaintext optimised for LLM context windows
- [x] JSON serialiser — structured output for MCP server and programmatic consumers
- [ ] Markdown serialiser — for GitHub PR comment integration

### Phase 4: Advanced Features (Future)
- [ ] Full TreeView panel (replace QuickPick) for better deep navigation
- [ ] Graphviz DOT export format (caller trees only)
- [ ] Mermaid diagram export format (caller trees only)
- [ ] Risk-based filtering (show only high-F caller paths)
- [ ] Impact metrics: "Changing this affects N symbols with combined F = X"
- [ ] Configuration: `ddp.impactTree.maxDepth`
- [ ] "Safe to change" indicator (no callers or all callers have low F)

---

## AI Agent Integration (ADR-004)

**Status**: Planned (2026-04-28)  
**Docs**: [ADR-004](../architecture/ADR-004-ai-agent-integration.md), [Implementation Guide](../guides/AI_AGENT_INTEGRATION_GUIDE.md)

Surface DDP risk data to AI coding agents at the point of code modification.  
Three-layer architecture: CLI output → PreToolUse hook → MCP server.

### Phase 1: CLI Caller-Tree Output ← *prerequisite for all other phases* ✅
- [x] `ddp callers` sub-command (overlaps with Impact Tree Phase 3 above)
- [x] `riskLevel` field: LOW / MEDIUM / HIGH / CRITICAL mapped from F ranges
- [x] `CallersResult` JSON schema with `impactSummary` and nested `callerTree`
- [x] `--format text` serialiser — risk header + indented tree + impact summary
- [x] `--format json` serialiser — structured, MCP-ready output
- [x] TDD: unit tests for serialisers, risk classification, depth limiting, recursive markers

### Phase 2: PreToolUse Hook (passive enforcement)
- [ ] `.claude/hooks/ddp-pre-edit-check.js` — fires before Edit / Write / MultiEdit
- [ ] Skip non-source files: `.json`, `.md`, `.yml`, `.yaml`, `*.test.*`, `*.spec.*`
- [ ] Warn output (stdout injected into agent context) when F > warnThreshold (default: 100)
- [ ] Block via exit code `2` when F > blockThreshold (default: 500)
- [ ] Threshold configuration: `agentIntegration.warnThreshold` / `blockThreshold` in `.ddprc.json`
- [ ] `.claude/settings.json` hook registration (committed to repo — applies to all contributors)
- [ ] Graceful degradation when DDP unavailable: exit 0, print notice, no false blocks
- [ ] Suggest `ddp callers` command in warning output

### Phase 3: MCP Server (active querying)
- [ ] `mcp-server/index.ts` — MCP server over stdio using `@modelcontextprotocol/sdk`
- [ ] Tool: `ddp_analyze_file(path)` → `SymbolMetrics[]` sorted by F desc
- [ ] Tool: `ddp_caller_tree(path, symbol, depth?)` → `CallersResult`
- [ ] Tool: `ddp_high_risk_symbols(path, fMin?)` → filtered `SymbolMetrics[]`
- [ ] Tool: `ddp_workspace_hotspots(topN?)` → top N by F score across workspace
- [ ] `.claude/settings.json` MCP server registration
- [ ] Thin wrapper only — delegates to CLI Phase 1 output (no duplicate logic)
- [ ] Add `@modelcontextprotocol/sdk` to `devDependencies`

---

## Language-Native Analysis (ADR-005)

**Status**: Planned (2026-05-01)  
**Docs**: [ADR-005](../architecture/ADR-005-language-native-analysis.md), [Implementation Guide](../guides/IMPLEMENTATION_GUIDE_NATIVE_ANALYSIS.md)

Eliminate the dependency on VS Code language server extensions for symbol extraction and call graph construction. Move all analysis capabilities into `src/language/<lang>/`, following the pattern already established for CC providers. Restores deterministic results, unblocks multi-language CLI, and enables future IntelliJ/PyCharm ports.

**Background**: `VsCodeSymbolProvider` currently delegates to `vscode.executeDocumentSymbolProvider`, which relies on whatever language server extensions the user has installed. Python requires Pylance; Java requires Language Support for Java. Without them, all functions show F=0. The CLI has no call graph at all (R=1 always). ADR-005 corrects the architectural mistake in ADR-002 Technical Decision 5.

### Phase 1: Language-Native Symbol Extraction (Priority: High)

#### 1a. Python symbol extraction
- [ ] New `src/language/python/symbolsSpawn.ts` — `runPythonSymbolExtraction(pythonPath, filePath, cwd, timeoutMs)` using `spawnAndCollect`
- [ ] New `src/language/python/symbolsParse.ts` — `parsePythonSymbolsJson(jsonText)` → `FunctionSymbolInfo[]`
- [ ] New `src/language/python/symbols.ts` — `PythonSymbolProvider` implementing `SymbolProvider` port
- [ ] Unit tests: `symbolsParse.test.ts` covers valid JSON, empty, malformed, nested functions/class methods
- [ ] Integration test: `simple.py` fixture → correct names and 0-based line numbers
- [ ] Graceful degradation: syntax errors and missing Python return `[]`, never throw

#### 1b. Java symbol extraction
- [ ] Extract `runPmdRaw(pmdPath, filePath, cwd, timeoutMs): Promise<string>` from `pmdSpawn.ts` (shared raw XML access)
- [ ] New `src/language/java/symbolsParse.ts` — `parsePmdSymbolsXml(xmlText)` → `FunctionSymbolInfo[]` from PMD violation attrs
- [ ] New `src/language/java/symbols.ts` — `JavaSymbolProvider` implementing `SymbolProvider` port
- [ ] Unit tests: PMD XML with/without method attributes, duplicate violation handling
- [ ] Document CC=1 limitation in JSDoc (PMD may not report methods with minimal complexity)

#### 1c. Replace VsCodeSymbolProvider
- [ ] New `NativeSymbolProvider` in `src/adapter/vscode/adapters.ts` — dispatches by `languageId` to `NodeSymbolProvider` | `PythonSymbolProvider` | `JavaSymbolProvider`
- [ ] `detectLanguageId(uri)` helper — maps file extension to language ID
- [ ] Wire `NativeSymbolProvider` into `AnalysisService` (pass `pythonPath` and `pmdPath` from config)
- [ ] Delete `VsCodeSymbolProvider` class (not just unused)
- [ ] Regression: VS Code extension test suite passes; symbol counts unchanged for TypeScript workspaces

### Phase 2: TypeScript Call Graph via Compiler API (Priority: High)

#### 2a. Native TS call graph
- [ ] New `src/language/typescript/callGraphBuild.ts` — `buildTypeScriptCallEdges(rootPath, fileUris)` using `ts.createProgram`
  - [ ] Walk `CallExpression` and `NewExpression` nodes
  - [ ] Resolve callee via `checker.getSymbolAtLocation()` + `checker.getAliasedSymbol()`
  - [ ] Resolve caller by walking up AST to enclosing function/method
  - [ ] Deduplicate edges; exclude self-calls; exclude `.d.ts` files
  - [ ] Symbol IDs must match `NodeSymbolProvider` format (`uri#line:character`, 0-based)
- [ ] New `src/language/typescript/callGraph.ts` — `NodeCallGraphProvider` wrapping `callGraphBuild.ts`
- [ ] Unit tests: two-file fixture (`caller.ts` → `callee.ts`) produces correct `CallEdge`
- [ ] Unit tests: recursive call excluded; duplicate calls deduplicated; declaration files skipped

#### 2b. Wire call graph into CLI
- [ ] Replace `nullCallGraphProvider` in `src/adapter/cli/cliAnalysis.ts` with `NodeCallGraphProvider`
- [ ] Delete `nullCallGraphProvider` stub
- [ ] Regression: `cliAnalysis.test.ts` passes; CLI analysis of a TypeScript project returns `edges.length > 0`
- [ ] Verify R > 1 for at least some symbols in a real TypeScript project

#### 2c. Hybrid VS Code call graph
- [ ] New `HybridCallGraphProvider` in `src/adapter/vscode/adapters.ts` — prefers LSP, falls back to native on empty/error
- [ ] Wire `HybridCallGraphProvider` into `AnalysisService` in place of `VsCodeCallGraphProvider`
- [ ] Unit tests: LSP returns edges → LSP result used; LSP returns empty → native used; LSP throws → native used

### Phase 3: Python and Java Call Graph (Deferred)

- [ ] Python native call graph — `src/language/python/callGraph.ts` (ast-based, subprocess)
- [ ] Java native call graph — `src/language/java/callGraph.ts` (PMD or tree-sitter)
- [ ] Document clearly in README that Python/Java R=1 until Phase 3 is complete

---

## Other Planned Features

- [ ] ddp config file in repo (`.ddprc.json`) — including `agentIntegration` thresholds
- [ ] test against python code (integration tests with sample Python projects)
- [ ] test against Java code (integration tests with sample Java projects)
- [ ] auto load/update symbol setting on code change
- [ ] right click context menu on symbol with ddp view call graph option
- [x] update formatHooverBreakdown to show dynamic analysis of the metric combination
- [ ] a shared "discover and filter files" function used by both paths (call graph and symbol metric)