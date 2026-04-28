# ADR-004: AI Agent Integration for Risk-Aware Code Modification

**Status:** Proposed  
**Date:** 2026-04-28  
**Deciders:** reschenburgIDBS

---

## Context

AI coding agents (Claude Code, GitHub Copilot, Cursor, and others) are increasingly used to modify production codebases directly. These agents have no inherent awareness of a function's risk profile — they may confidently edit a function with F=800 and R=46 without any warning, potentially introducing bugs that cascade through dozens of callers.

DDP already computes exactly the data needed to quantify this risk. The question is how to surface it to an agent at the moment of code modification — both:

1. **Actively** — when the agent explicitly queries "what is the risk of this symbol?" before deciding whether to change it
2. **Passively** — automatically, before any edit executes, without relying on the agent remembering to check

Relying solely on CLAUDE.md prompting (approach: "tell the agent to check") is insufficient. Agents lose instructions under context pressure, and there is no enforcement mechanism. The architectural solution must operate at the tool-call boundary.

---

## Decision

Implement a three-layer integration architecture. Each layer is independently useful; each depends only on the layer below it.

### Layer 1: CLI Caller-Tree Output (Foundation)

Extend the existing CLI with a dedicated `callers` sub-command:

```bash
# Caller tree for a specific symbol — returns tree + metrics at each node
ddp callers --file <path> --symbol <name> [--depth N] [--format json|text|markdown]

# Examples
ddp callers --file src/core/analyze.ts --symbol computeSymbolMetrics --format text
ddp callers --file src/core/analyze.ts --symbol computeSymbolMetrics --format json --depth 5
```

**Output format design:**

`--format text` — optimised for LLM readability; indented plaintext the agent can reason about directly:

```
DDP RISK: src/core/analyze.ts :: computeSymbolMetrics
──────────────────────────────────────────────────────
  F=847.2  R=46.3  CC=12  T=0.87  CRAP=18.3  [HIGH RISK ⚠️]

CALLER TREE (who depends on this symbol):
  AnalysisOrchestrator::run  F=423.1  R=8.2   (depth 1)
    └─ extension::activate   F=45.2   R=1.0   (depth 2)
  analyzeWorkspace           F=234.1  R=4.1   (depth 1)
    └─ runCLI                F=156.3  R=2.8   (depth 2)
       └─ runCLIFromConfig   F=89.4   R=1.9   (depth 3)

IMPACT SUMMARY:
  Direct callers: 2  |  Total affected: 5  |  Combined F: 948.1
  Highest-risk caller: AnalysisOrchestrator::run (F=423.1)
```

`--format json` — optimised for programmatic consumption (MCP server, CI pipelines):

```json
{
  "symbol": "computeSymbolMetrics",
  "file": "src/core/analyze.ts",
  "metrics": { "cc": 12, "t": 0.87, "crap": 18.3, "r": 46.3, "f": 847.2 },
  "riskLevel": "HIGH",
  "impactSummary": {
    "directCallers": 2,
    "totalAffected": 5,
    "combinedF": 948.1,
    "highestRiskCaller": { "id": "AnalysisOrchestrator::run", "f": 423.1 }
  },
  "callerTree": [
    {
      "id": "AnalysisOrchestrator::run",
      "depth": 1,
      "recursive": false,
      "metrics": { "f": 423.1, "r": 8.2 },
      "callers": [
        { "id": "extension::activate", "depth": 2, "recursive": false, "metrics": { "f": 45.2 } }
      ]
    }
  ]
}
```

`--format markdown` — for GitHub Actions PR comments and summaries.

The existing `callerTree.ts` (`CallerNode[]` / `flattenTree()`) maps directly to this output. The primary new work is a serialisation adapter in `src/adapter/cli/`.

### Layer 2A: Claude Code PreToolUse Hook (Passive Enforcement)

A hook configured in `.claude/settings.json` fires automatically before every `Edit`, `Write`, or `MultiEdit` tool call:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/ddp-pre-edit-check.js"
          }
        ]
      }
    ]
  }
}
```

The hook script (`.claude/hooks/ddp-pre-edit-check.js`):

1. Reads the tool input from stdin (JSON with `file_path` or `path` field)
2. Skips non-source files (config, markdown, JSON, test files) — exits 0 silently
3. Runs `ddp analyze --file <path> --format json`
4. Identifies symbols exceeding the warn threshold (default: F > 100)
5. **Warn mode** (F > 100): writes a structured warning to stdout — Claude Code injects this into the agent's context window before the edit executes
6. **Block mode** (F > 500): exits with code `2`, which halts the edit and requires the agent to explicitly acknowledge the risk before retrying

This is the key mechanism for **passive enforcement**: it operates at the tool-call boundary and does not rely on the agent's attention span or conversational memory.

**Configurable thresholds** (via `.ddprc.json` or environment):

```json
{
  "agentIntegration": {
    "warnThreshold": 100,
    "blockThreshold": 500,
    "skipTestFiles": true,
    "skipPatterns": ["**/*.json", "**/*.md", "**/*.yml"]
  }
}
```

### Layer 2B: MCP Server (Active Querying)

An MCP (Model Context Protocol) server wrapping DDP analysis, exposing tools to any MCP-compatible agent:

| Tool | Arguments | Returns |
|------|-----------|---------|
| `ddp_analyze_file` | `path: string` | `SymbolMetrics[]` for all symbols in the file |
| `ddp_caller_tree` | `path, symbol, depth?` | Caller tree with metrics at each node |
| `ddp_high_risk_symbols` | `path, fMin?` | Filtered list of symbols above threshold |
| `ddp_workspace_hotspots` | `topN?` | Top N riskiest symbols across workspace |

The MCP server is a thin wrapper around the CLI Layer 1 output — it spawns `ddp callers --format json` and deserialises the result. This means Layer 1 must be complete before the MCP server can be built.

### Layer 3: CLAUDE.md Protocol Instructions

Instructions in the project's `CLAUDE.md` that:

- Define risk thresholds the agent should respect
- Tell the agent to run `ddp callers` before modifying a high-F symbol
- Explain what to do with the output (warn user, add tests first, etc.)

These act as a safety net when the hook is not installed and provide the agent with domain knowledge for interpreting the metrics. They are **not sufficient alone** but are a necessary complement to the hook.

---

## Implementation Sequence

```
Phase 1 (days 1–3): CLI caller-tree output
  ├── ddp callers sub-command
  ├── --format json|text|markdown serialisers
  └── Reuses: callerTree.ts, graphTraversal.ts, AnalysisResult.edges

Phase 2 (days 4–5): PreToolUse hook
  ├── .claude/hooks/ddp-pre-edit-check.js
  ├── .claude/settings.json hook registration
  └── Depends on: Phase 1 CLI output

Phase 3 (days 6–9): MCP server
  ├── mcp-server/index.ts — four tools over stdio
  └── Depends on: Phase 1 CLI output
      Enables: any MCP-compatible agent

Phase 4 (ongoing): CLAUDE.md instructions
  └── Document thresholds, commands, and expected agent behaviour
      Effective immediately; updates as thresholds are calibrated
```

---

## Consequences

### Positive

- Agents are warned at the tool-call boundary, not just via prompts they may forget
- The same CLI serialisation layer (Phase 1) serves both the hook and the MCP server
- Works with any MCP-compatible agent, not just Claude Code
- Thresholds are project-configurable
- No changes to the domain core (`src/core/`)
- Hook exit code 2 provides hard enforcement when needed

### Negative

- Adds latency to every file edit (mitigated by targeting only source files; fast CLI execution)
- Hook must be installed per developer — it is not automatic for all contributors
- MCP server requires a running Node.js process (managed separately)

### Neutral

- The hook exits 0 silently for non-source files (no overhead for config/doc edits)
- Warn vs block thresholds should be calibrated per project after initial rollout

---

## Alternatives Considered

### CLAUDE.md Instructions Only

Rejected as primary mechanism. Agents lose context under pressure and there is no enforcement mechanism. Suitable only as a complement to the hook.

### VS Code Extension Inline Warning Only

Insufficient: does not cover CLI-based agents or headless contexts. Cannot intercept tool calls.

### Static Analysis Gate in CI (Post-Commit)

Complementary, not a replacement. CI gates run after the change is committed; the value of this integration is the warning *before* the edit executes.

### Blocking All High-Risk Edits

Rejected. Blocking is appropriate only at the highest risk tier (F > 500). For most warnings, the agent should be informed and allowed to proceed — the goal is awareness, not a hard gate.

---

## Related Documents

- **ADR-001** — CLI Analysis Architecture (GitHub Actions integration)
- **ADR-002** — Language Module Extraction
- **ADR-003** — Call Graph Visualization (caller tree in VS Code UI)
- **`docs/guides/AI_AGENT_INTEGRATION_GUIDE.md`** — Step-by-step implementation guide
- **`features/ai-agent-integration.feature`** — BDD scenarios for all three layers
- **`CLAUDE.md`** — Code Modification Safety Protocol (agent-facing instructions)
