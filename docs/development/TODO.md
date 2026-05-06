# DDP Development TODO

## Priority Order (Active Sprint)

1. **Java Call Graph** — complete R>1 for Java (requires Java fixtures first)
2. **MCP Server** — active querying for all MCP-compatible agents
3. **Agent Wiring** — Claude Code + Copilot MCP registration + documentation
4. **Config File** — `.ddprc.json` read by CLI, VS Code, and MCP server; overrides all other settings

---

## 1. Java Call Graph (ADR-005 Phase 3 — Java) ✅ DONE

**Status**: Complete (2026-05-05)  
**Docs**: [ADR-005](../architecture/ADR-005-language-native-analysis.md)  
**Approach**: Option B — direct Java source parsing via regex (no external dependency)

### Step 1: Java Integration Test Fixture ✅

- [x] Create `src/test/fixtures/cli/java-project/` directory structure
  - [x] `src/main/java/com/example/` — 3 `.java` files with caller/callee relationships
    - [x] `Service.java` — calls `Repository.java` methods (simulates common layered pattern)
    - [x] `Repository.java` — called by `Service.java`; calls `Util.java`
    - [x] `Util.java` — called by `Repository.java`; no outbound calls (leaf node)
  - [x] `pom.xml` — minimal Maven project descriptor
  - [x] `coverage/jacoco.xml` — minimal JaCoCo fixture covering some methods
- [x] Integration test in `src/language/java/javaIntegration.test.ts`:
  - [x] Java project produces `edges.length > 0`
  - [x] Service → Repository edges exist
  - [x] Repository → Util edges exist
  - [x] Util has no outbound edges (leaf node)
  - [x] R > 1 through full pipeline (via `JavaNativeSymbolProvider` — no PMD needed)

### Step 2: Java Call Graph Implementation ✅

**Implemented**: Option B — regex-based Java source parsing

- [x] `src/language/java/callGraphParse.ts` — parse Java source for class/method/field declarations
- [x] `src/language/java/callGraphBuild.ts` — raw call edge extraction
  - [x] Parse caller class + method from source context
  - [x] Parse callee class + method from call expression (this-qualified, unqualified, field-qualified, static)
  - [x] Emit `CallEdge[]` with symbol IDs matching `JavaSymbolProvider` format (`uri#line:0`)
  - [x] Deduplicate edges; exclude self-calls
- [x] `src/language/java/callGraph.ts` — `JavaCallGraphProvider` wrapping `callGraphBuild.ts`
- [x] Unit tests (TDD — all written before implementation):
  - [x] `Service.java` → `Repository.java` call produces correct `CallEdge`
  - [x] Self-calls excluded
  - [x] Duplicate call sites deduplicated to single edge
  - [x] Missing/malformed source returns `[]`, never throws
  - [x] Intra-class calls (`this.method()` and unqualified `method()`)
  - [x] Multi-layer chain (Service → Repository → Util)
  - [x] Empty file produces 0 edges
- [x] `src/language/nativeCallGraphProvider.ts` — multi-language dispatch (TS + Java)
- [x] Wired into `src/adapter/cli/cliAnalysis.ts` (replaces `NodeCallGraphProvider`)

### Step 3: VS Code Hybrid Call Graph for Java ✅

- [x] `NativeCallGraphProvider` includes Java — wired into `analysisService.ts` as hybrid fallback
  - [x] Java: `JavaCallGraphProvider` via `NativeCallGraphProvider`; LSP as primary (existing `HybridCallGraphProvider`)
- [x] Update README: document Java call graph support (PMD optional, native extraction)

---

## 2. MCP Server (ADR-004 Phase 3) ✅ DONE

**Status**: Complete (2026-05-05)  
**Docs**: [ADR-004](../architecture/ADR-004-ai-agent-integration.md)  
**Prerequisite**: Java call graph (above) so MCP exposes accurate R for all supported languages

MCP server over stdio — adapter calling `runCliAnalysis()` directly (hexagonal pattern). No new domain logic.

### Implementation

- [x] Add `@modelcontextprotocol/sdk` to `dependencies` in `package.json`
- [x] Create `src/adapter/mcp/` directory (under `src/adapter/` for hexagonal consistency; `tsconfig.json` `rootDir: "src"` required this)
- [x] `src/adapter/mcp/index.ts` — MCP server factory (`createMcpServer`) with 4 tools registered via `McpServer.registerTool`
- [x] `src/adapter/mcp/bin.ts` — standalone entry point (stdio transport)
- [x] `src/adapter/mcp/tools/analyzeFile.ts` — `ddp_analyze_file(path)` → `SymbolMetrics[]` sorted by F desc
- [x] `src/adapter/mcp/tools/callerTree.ts` — `ddp_caller_tree(path, symbol, depth?)` → `CallersResult`
- [x] `src/adapter/mcp/tools/highRiskSymbols.ts` — `ddp_high_risk_symbols(path, fMin?)` → filtered `SymbolMetrics[]`
- [x] `src/adapter/mcp/tools/workspaceHotspots.ts` — `ddp_workspace_hotspots(topN?)` → top N by F across workspace
- [x] Each tool: calls `runCliAnalysis()` directly (injected `RunAnalysis` port) — no duplicate logic
- [ ] `index.ts` reads thresholds from `.ddprc.json` (requires Config File task below; hardcoded defaults for now)
- [x] Add `"mcp"` script to `package.json`: `"mcp": "node out/adapter/mcp/bin.js"`
- [x] Unit tests for each tool (26 tests, mock analysis via dependency injection):
  - [x] Returns correct schema on success
  - [x] Propagates analysis errors as MCP error responses
  - [x] fMin default = 0 (returns all symbols)
  - [x] topN default = 10

---

## 3. Agent Wiring + Documentation 🟡 IN PROGRESS

**Status**: Partially complete (2026-05-05)  
**Prerequisite**: MCP server running ✅

### Claude Code

- [x] Register MCP server in `.claude/settings.json` (committed to repo — all contributors get it)
- [ ] Update `CLAUDE.md` — add MCP tool reference alongside existing `ddp callers` CLI instructions
- [ ] Update `docs/guides/AI_AGENT_INTEGRATION_GUIDE.md` — MCP server setup, tool descriptions, example queries

### GitHub Copilot (VS Code)

- [x] Register MCP server in VS Code workspace settings (`.vscode/settings.json`)
- [ ] Create `.github/copilot-instructions.md` — DDP risk protocol instructions for Copilot (mirrors `CLAUDE.md` protocol section)
- [ ] Test: Copilot chat can invoke `ddp_analyze_file` and receive risk data

### Documentation

- [x] Update README — "AI Agent Integration" section covering both Claude Code and Copilot (with and without VS Code extension)
- [ ] Add `docs/guides/MCP_SERVER_GUIDE.md` — installation, tool reference, example sessions
- [ ] Markdown serialiser for `ddp callers --format markdown` — for GitHub PR comment integration

---

## 4. Config File Wiring 🟡 IN PROGRESS

**Status**: Core + CLI complete  
**Schema**: `docs/examples/ddprc.schema.json` (updated: added `agentIntegration`, `debug`; fixed `fileRollup` enum)

`.ddprc.json` at project root — read by CLI, VS Code extension, and MCP server.

### Configuration Priority (canonical)

Priority order — highest beats lowest:

| Tool       | Priority order                                                              |
|------------|-----------------------------------------------------------------------------|
| **CLI**    | explicit CLI flag → `.ddprc.json` → `DDP_CONFIG_DEFAULTS`                   |
| **VS Code**| `.ddprc.json` → VS Code workspace settings (`ddp.*`) → `DDP_CONFIG_DEFAULTS`|
| **MCP**    | `.ddprc.json` → `DDP_CONFIG_DEFAULTS`                                       |

`DDP_CONFIG_DEFAULTS` (in `src/core/config.ts`) is the **single source of truth** for default values across all tools. `DEFAULT_CONFIGURATION` (VS Code) derives shared fields from it; a drift-prevention test (`src/core/configDefaults.test.ts`) fails if either constant is changed in isolation.

### Core Parsing ✅

- [x] New `src/core/config.ts` — `loadDdpConfig(rootPath): Promise<DdpFileConfig>`
  - [x] Reads `.ddprc.json` from `rootPath`; returns merged config with defaults
  - [x] Unknown keys ignored (forward-compatible)
  - [x] Invalid JSON → log warning, return defaults (never throw)
  - [x] Type-mismatched scalars fall back to defaults silently
  - [x] Array-at-root or primitive-at-root → warn + defaults
  - [x] Defensive copies — caller cannot mutate `DDP_CONFIG_DEFAULTS` via the result
  - [x] Unit tests: missing file → defaults; valid JSON → merged; invalid JSON → defaults + warning
  - [x] 14 unit tests, `DDP_CONFIG_DEFAULTS` with all sections

### CLI Integration ✅

- [x] New `src/adapter/cli/resolveOptions.ts` — pure merge function (CLI args > config > defaults)
  - [x] `parseArgs` returns `respectGitignoreExplicit` to distinguish user-set from default
  - [x] `excludePatterns`: CLI wins when non-empty, config when empty
  - [x] `debug`: CLI `--verbose` OR config `debug` (either enables — documented in `--help`)
  - [x] `rank`, `cc`, `jacocoGlob`, `fileRollup` flow from `.ddprc.json` to `runCliAnalysis`
  - [x] 17 unit tests
- [x] Wire into `src/adapter/cli/main.ts` (`runAnalyze` + `runCallers`)
  - [x] Config file loaded before arg defaults applied
  - [x] CLI args override config file values (args win)
  - [x] `--root` determines config file location
- [x] Integration tests: CLI with `.ddprc.json` uses config; CLI args override config (3 tests, isolated tmpdir)

### Default-value Drift Prevention ✅

- [x] `DDP_CONFIG_DEFAULTS` is the canonical defaults constant
- [x] `DEFAULT_CONFIGURATION` (VS Code) derives all shared fields from it
- [x] `src/core/configDefaults.test.ts` — 15 drift tests fail loudly if either drifts

### VS Code Integration

- [ ] Wire `loadDdpConfig` into `src/adapter/vscode/configuration.ts`
  - [ ] `.ddprc.json` overrides VS Code settings (`.ddprc.json > workspace settings > defaults`)
  - [ ] Reload config on `workspace.onDidChangeTextDocument` for `.ddprc.json`
  - [ ] Tests: config file present → overrides VS Code `ddp.*` settings

### MCP Server Integration

- [ ] MCP server reads `.ddprc.json` from `cwd` on startup (no VS Code config layer)
- [ ] `agentIntegration.warnThreshold` / `blockThreshold` used by tool responses
- [ ] Reload on file change (or restart-on-change)

### Config Schema

Normative schema: `docs/examples/ddprc.schema.json`. Example: `docs/examples/ddprc.example.json`.

Key sections: `maxFiles`, `fileFilter`, `coverage`, `cc`, `rank`, `fileRollup`, `debug`, `churn`, `agentIntegration`, `output`.

### Output config wiring (reserved — not yet consumed)

The `output` section (`topFilesCount`, `topSymbolsCount`, `riskThresholds.*`)
is accepted by `loadDdpConfig` and merged into the resolved configuration,
but no formatter currently reads it. Setting these values has no effect
today. Wiring tasks:

- [ ] `formatAnalysisAsJson` honors `output.topFilesCount` (slice top-N risky files)
- [ ] `formatAnalysisAsJson` honors `output.topSymbolsCount` (slice per-file top-N risky symbols)
- [ ] `output.riskThresholds.high` / `medium` consumed by terminal/markdown summaries

---

## Completed Work

### ADR-003: Impact Tree Visualization ✅ (2026-04-28)

- [x] Core caller tree domain logic (`src/core/callerTree.ts`)
- [x] Cycle detection, max depth limiting, impact summary
- [x] VS Code sidebar UI (`impactTreeCommand.ts`, context menu)
- [x] CLI `ddp callers` sub-command with `--format json|text`
- [x] `CallersResult` JSON schema + risk level classification
- [x] LLM-optimised text serialiser

### ADR-004 Phase 1: CLI Caller-Tree Output ✅

- [x] `ddp callers` sub-command
- [x] JSON + text serialisers
- [x] Risk level classification (LOW/MEDIUM/HIGH/CRITICAL)

### ADR-005 Phase 1: Language-Native Symbol Extraction ✅

- [x] `src/language/python/symbolsSpawn.ts` + `symbolsParse.ts` + `symbols.ts`
- [x] `src/language/java/symbolsParse.ts` + `symbols.ts`
- [x] `src/language/nativeSymbolProvider.ts` — dispatch by languageId

### ADR-005 Phase 2: TypeScript Call Graph via Compiler API ✅ (2026-05-05)

- [x] `src/language/typescript/callGraphBuild.ts` — AST traversal, CallExpression resolution
- [x] `src/language/typescript/callGraph.ts` — `NodeCallGraphProvider`
- [x] Wired into `src/adapter/cli/cliAnalysis.ts` (replaces nullCallGraphProvider)
- [x] Hybrid VS Code call graph (LSP primary, native fallback)

### ADR-005 Phase 3: Java Call Graph via Source Parsing ✅ (2026-05-05)

- [x] `src/language/java/callGraphParse.ts` — regex-based Java source parser (classes, methods, fields, calls)
- [x] `src/language/java/callGraphBuild.ts` — cross-file call edge builder with type resolution
- [x] `src/language/java/callGraph.ts` — `JavaCallGraphProvider`
- [x] `src/language/nativeCallGraphProvider.ts` — multi-language dispatch (TS + Java)
- [x] Wired into CLI (`cliAnalysis.ts`) and VS Code (`analysisService.ts`)
- [x] `features/java-call-graph.feature` — 9 BDD scenarios
- [x] 32 new tests (10 parse + 11 build + 3 provider + 3 dispatch + 5 integration)

### Native Java Symbol Provider ✅ (2026-05-05)

- [x] `src/language/java/nativeSymbols.ts` — `JavaNativeSymbolProvider` using `callGraphParse.ts`
- [x] Finds ALL methods regardless of CC (PMD only finds CC ≥ 2)
- [x] Symbol IDs match call graph edge IDs (`uri#line:0`)
- [x] Wired into `NativeSymbolProvider` (replaces `JavaSymbolProvider` for symbol extraction)
- [x] PMD retained for accurate CC via `PmdCcProvider` in registry; fallback regex estimator when PMD absent
- [x] R > 1 through full CLI pipeline verified (integration test)
- [x] 6 new tests + updated `nativeSymbolProvider.test.ts`

---

## Backlog (De-prioritised)

These items are valid but not part of the current sprint. Revisit after priorities 1–4 above are complete.

- [ ] ADR-004 Phase 2: PreToolUse hook (`.claude/hooks/ddp-pre-edit-check.js`) — superseded by MCP as primary agent integration mechanism; hook adds latency per-edit
- [ ] ADR-005 Phase 3: Python call graph (`src/language/python/callGraph.ts`) — R=1 for Python; deferred until Java call graph proves the pattern
- [ ] Markdown serialiser for `ddp callers --format markdown` — moved to Agent Wiring task above
- [ ] Full TreeView panel (replace QuickPick) for deep impact navigation
- [ ] Graphviz DOT / Mermaid export formats (caller trees only)
- [ ] Risk-based filtering (show only high-F caller paths in tree)
- [ ] `ddp.impactTree.maxDepth` configuration
- [ ] "Safe to change" indicator (no callers or all callers have low F)
- [ ] GitHub Actions package (Docker-based, PR comment bot)
- [ ] SARIF output format
- [ ] Trend tracking (risk over time)
- [ ] Shared "discover and filter files" function (call graph + symbol metric paths)
- [ ] Auto reload symbols on code change
- [ ] Right-click context menu → "View call graph"
- [ ] Python integration tests with sample Python project
