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
- [ ] Create `src/core/formatImpactTree.ts` for text/ASCII tree formatting (LLM-optimised)
  - [ ] Tests for empty caller trees (entry points)
  - [ ] Tests for single/multi-level formatting with depth indicators
  - [ ] Tests for recursive caller markers
  - [ ] Tests for impact summary formatting
- [ ] Add `ddp callers` sub-command: `--file`, `--symbol`, `--depth`, `--format json|text|markdown`
- [ ] `CallersResult` JSON schema: `{ symbol, file, metrics, riskLevel, impactSummary, callerTree }`
- [ ] Risk level classification: LOW (F≤50) / MEDIUM (50–200) / HIGH (200–500) / CRITICAL (F>500)
- [ ] Text serialiser — indented plaintext optimised for LLM context windows
- [ ] JSON serialiser — structured output for MCP server and programmatic consumers
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

### Phase 1: CLI Caller-Tree Output ← *prerequisite for all other phases*
- [ ] `ddp callers` sub-command (overlaps with Impact Tree Phase 3 above)
- [ ] `riskLevel` field: LOW / MEDIUM / HIGH / CRITICAL mapped from F ranges
- [ ] `CallersResult` JSON schema with `impactSummary` and nested `callerTree`
- [ ] `--format text` serialiser — risk header + indented tree + impact summary
- [ ] `--format json` serialiser — structured, MCP-ready output
- [ ] TDD: unit tests for serialisers, risk classification, depth limiting, recursive markers

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

## Other Planned Features

- [ ] ddp config file in repo (`.ddprc.json`) — including `agentIntegration` thresholds
- [ ] test against python code (integration tests with sample Python projects)
- [ ] test against Java code (integration tests with sample Java projects)
- [ ] auto load/update symbol setting on code change
- [ ] right click context menu on symbol with ddp view call graph option
- [ ] update formatHooverBreakdown to show dynamic analysis of the metric combination