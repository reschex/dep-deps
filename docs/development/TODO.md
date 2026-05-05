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
  - [ ] `pom.xml` or `build.gradle` — minimal project descriptor (enables PMD path resolution)
  - [ ] `coverage/jacoco.xml` — minimal JaCoCo fixture covering some methods (reuse pattern from existing TS fixture)
- [x] Integration test in `src/language/java/javaIntegration.test.ts`:
  - [x] Java project produces `edges.length > 0`
  - [x] Service → Repository edges exist
  - [x] Repository → Util edges exist
  - [x] Util has no outbound edges (leaf node)
  - [ ] R > 1 through full pipeline (blocked: requires native Java symbol provider or PMD — see backlog)

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
- [ ] Update README: document Java call graph support (remove R=1 limitation note)

---

## 2. MCP Server (ADR-004 Phase 3) 🟡 NEXT

**Status**: Planned  
**Docs**: [ADR-004](../architecture/ADR-004-ai-agent-integration.md)  
**Prerequisite**: Java call graph (above) so MCP exposes accurate R for all supported languages

MCP server over stdio — thin wrapper around CLI output. No new domain logic.

### Implementation

- [ ] Add `@modelcontextprotocol/sdk` to `dependencies` in `package.json`
- [ ] Create `mcp-server/` directory
- [ ] `mcp-server/index.ts` — MCP server entry point (stdio transport)
- [ ] `mcp-server/tools/analyzeFile.ts` — `ddp_analyze_file(path)` → `SymbolMetrics[]` sorted by F desc
- [ ] `mcp-server/tools/callerTree.ts` — `ddp_caller_tree(path, symbol, depth?)` → `CallersResult`
- [ ] `mcp-server/tools/highRiskSymbols.ts` — `ddp_high_risk_symbols(path, fMin?)` → filtered `SymbolMetrics[]`
- [ ] `mcp-server/tools/workspaceHotspots.ts` — `ddp_workspace_hotspots(topN?)` → top N by F across workspace
- [ ] Each tool: spawns CLI via `spawnAndCollect`, deserialises JSON output — no duplicate logic
- [ ] `mcp-server/index.ts` reads thresholds from `.ddprc.json` (requires Config File task below, or hardcode defaults initially)
- [ ] Add `"mcp"` script to `package.json`: `"mcp": "node out/mcp-server/index.js"`
- [ ] Unit tests for each tool (mock CLI spawn):
  - [ ] Returns correct schema on success
  - [ ] Propagates CLI errors as MCP error responses
  - [ ] fMin default = 0 (returns all symbols)
  - [ ] topN default = 10

---

## 3. Agent Wiring + Documentation 🟡 NEXT

**Status**: Planned  
**Prerequisite**: MCP server running

### Claude Code

- [ ] Register MCP server in `.claude/settings.json` (committed to repo — all contributors get it):
  ```json
  {
    "mcpServers": {
      "ddp": {
        "command": "node",
        "args": ["out/mcp-server/index.js"],
        "cwd": "${workspaceFolder}"
      }
    }
  }
  ```
- [ ] Update `CLAUDE.md` — add MCP tool reference alongside existing `ddp callers` CLI instructions
- [ ] Update `docs/guides/AI_AGENT_INTEGRATION_GUIDE.md` — MCP server setup, tool descriptions, example queries

### GitHub Copilot (VS Code)

- [ ] Register MCP server in VS Code workspace settings (`.vscode/settings.json`):
  ```json
  {
    "github.copilot.chat.mcp.enabled": true,
    "mcp": {
      "servers": {
        "ddp": {
          "command": "node",
          "args": ["out/mcp-server/index.js"],
          "type": "stdio"
        }
      }
    }
  }
  ```
- [ ] Create `.github/copilot-instructions.md` — DDP risk protocol instructions for Copilot (mirrors `CLAUDE.md` protocol section)
- [ ] Test: Copilot chat can invoke `ddp_analyze_file` and receive risk data

### Documentation

- [ ] Update README — "AI Agent Integration" section covering both Claude Code and Copilot
- [ ] Add `docs/guides/MCP_SERVER_GUIDE.md` — installation, tool reference, example sessions
- [ ] Markdown serialiser for `ddp callers --format markdown` — for GitHub PR comment integration

---

## 4. Config File Wiring 🟢 THEN

**Status**: Planned  
**Schema**: `docs/examples/ddprc.schema.json` (defined, not yet parsed)

`.ddprc.json` at project root — read by CLI, VS Code extension, and MCP server. Overrides all other settings (CLI defaults, VS Code settings). Merge strategy: `.ddprc.json` wins over environment, which wins over VS Code settings, which wins over built-in defaults.

### Core Parsing

- [ ] New `src/core/config.ts` — `loadDdpConfig(rootPath): Promise<DdpConfig>`
  - [ ] Reads `.ddprc.json` from `rootPath`; returns merged config with defaults
  - [ ] Unknown keys ignored (forward-compatible)
  - [ ] Invalid JSON → log warning, return defaults (never throw)
  - [ ] Unit tests: missing file → defaults; valid JSON → merged; invalid JSON → defaults + warning

### CLI Integration

- [ ] Wire `loadDdpConfig` into `src/adapter/cli/parseArgs.ts`
  - [ ] Config file loaded before arg defaults applied
  - [ ] CLI args override config file values (args win)
  - [ ] `--root` determines config file location
- [ ] Tests: CLI with `.ddprc.json` present uses config thresholds; CLI args override config

### VS Code Integration

- [ ] Wire `loadDdpConfig` into `src/adapter/vscode/configuration.ts`
  - [ ] `.ddprc.json` overrides VS Code settings
  - [ ] Reload config on `workspace.onDidChangeTextDocument` for `.ddprc.json`
  - [ ] Tests: config file present → overrides VS Code `ddp.*` settings

### MCP Server Integration

- [ ] MCP server reads `.ddprc.json` from `cwd` on startup
- [ ] `agentIntegration.warnThreshold` / `blockThreshold` used by tool responses
- [ ] Reload on file change (or restart-on-change)

### Config Schema (fields to support)

```json
{
  "agentIntegration": {
    "warnThreshold": 100,
    "blockThreshold": 500,
    "skipTestFiles": true,
    "skipPatterns": ["**/*.json", "**/*.md", "**/*.yml"]
  },
  "analysis": {
    "excludeTests": true,
    "respectGitignore": false,
    "maxFiles": 500
  },
  "churn": {
    "enabled": false,
    "since": "6 months ago"
  },
  "thresholds": {
    "crap": 30,
    "f": 100,
    "cc": 10
  }
}
```

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

---

## Backlog (De-prioritised)

These items are valid but not part of the current sprint. Revisit after priorities 1–4 above are complete.

- [ ] ADR-004 Phase 2: PreToolUse hook (`.claude/hooks/ddp-pre-edit-check.js`) — superseded by MCP as primary agent integration mechanism; hook adds latency per-edit
- [ ] Native Java symbol provider (`src/language/java/nativeSymbols.ts`) — extract methods from Java source via regex (reuse `callGraphParse.ts`), removing PMD dependency for symbol extraction. Currently `JavaSymbolProvider` requires PMD and misses CC=1 methods. A native provider would: (1) find ALL methods regardless of CC, (2) enable R>1 in full pipeline without PMD installed, (3) use fallback CC estimation for methods PMD misses. Wire into `NativeSymbolProvider` as primary, PMD as optional CC enhancement.
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
