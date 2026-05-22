# ADR-006: Hook Backend, `ddp init` Installation, and CLI Packaging

**Status:** Proposed
**Date:** 2026-05-22
**Deciders:** reschenburgIDBS
**Related:** ADR-001 (CLI Analysis Architecture), ADR-004 (AI Agent Integration), ADR-005 (Language-Native Analysis)
**Revises:** ADR-004 Layer 2A (PreToolUse hook implementation)

---

## Context

ADR-004 specified a three-layer AI agent integration: a CLI caller-tree output (Layer 1), a PreToolUse hook for passive enforcement (Layer 2A), and an MCP server for interactive querying (Layer 2B). All three layers are now implemented:

- `src/adapter/cli/` produces JSON, text, and markdown analysis output via `runCliAnalysis`
- `src/adapter/mcp/` exposes `ddp_analyze_file`, `ddp_high_risk_symbols`, `ddp_caller_tree`, and `ddp_workspace_hotspots` over MCP stdio
- `.claude/hooks/ddp-pre-edit-check.js` is registered as a `PreToolUse` hook
- `.claude/settings.json` registers both the MCP server and the hook

Post-implementation review surfaced three problems that were not addressed in ADR-004:

### Problem 1: The Hook Calls the MCP Server

The current hook spawns `out/adapter/mcp/bin.js` and performs a full MCP JSON-RPC handshake — `initialize` → `notifications/initialized` → `tools/call` `ddp_high_risk_symbols` — to obtain the data it needs to evaluate the edit. The MCP server is itself a thin wrapper around `runCliAnalysis`. The hook therefore pays for an entire protocol session (process startup, capability negotiation, lifecycle messages, JSON-RPC framing) to access data that the CLI already emits directly as JSON to stdout.

This is incorrect layering. The hook is a synchronous per-edit invocation; it needs a one-shot analysis result. MCP is designed for **persistent sessions** where a long-lived agent issues many requests to a long-lived server. Driving MCP for a single request adds protocol complexity, error surface, and latency without providing any of MCP's value (session state, capability discovery, streaming).

Both the hook and the MCP server consume the same underlying capability (`runCliAnalysis`). The hook should consume it directly via the CLI; the MCP server retains its role as the interactive session backend for agent-initiated queries.

### Problem 2: Hook Installation Is Manual

ADR-004 left hook installation as a per-developer manual step: copy `ddp-pre-edit-check.js` into `.claude/hooks/`, hand-edit `.claude/settings.json` to add the `PreToolUse` block, ensure the path resolution is correct for the current OS. This is error-prone and does not scale. The hook is only valuable if it is actually installed, and there is currently no automation to do so reliably across project-scoped and global-scoped Claude Code configurations.

### Problem 3: CLI Packaging Reflects Initial Scope, Not Current Reality

`package.json` currently registers `"bin": { "ddp-analyze": "./out/adapter/cli/bin.js" }`. The CLI help text, BDD scenarios, hook protocol script (`docs/guides/AI_AGENT_INTEGRATION_GUIDE.md`), and CLAUDE.md all refer to the command as `ddp`. The mismatch between the `bin` entry and every other reference creates installation confusion (`npx ddp …` works only because users run from the source tree).

Additionally, `"main": "./dist/extension.js"` points at the VS Code extension bundle. A consumer that wants to import DDP analysis programmatically (for example, a custom MCP server in a different project, a build-time risk gate, or an alternative IDE adapter) currently has to either depend on the VS Code bundle (impossible without the VS Code runtime) or reach into `out/` paths directly (unsupported). The package needs a deliberate programmatic export surface that is independent of the VS Code extension entry point.

---

## Decision

Four changes, each independent but jointly addressing the layering, installation, and packaging gaps surfaced above.

### Decision 1: Hook Calls the CLI Directly

The `PreToolUse` hook spawns `out/adapter/cli/bin.js --format json …` and parses the result directly. The MCP protocol is removed from the hook path entirely.

**Hook flow (revised):**

```
Edit/Write/MultiEdit tool call
  └─→ Claude Code fires PreToolUse hook
       └─→ ddp-pre-edit-check.js
            ├─ reads tool input from stdin (file_path)
            ├─ skips non-source / test / config files (silent exit 0)
            ├─ spawns: node <cli-bin> analyze --file <path> --format json
            ├─ parses CLI JSON output:
            │     { files: [{ path, symbols: [{ name, f, r, cc, t, crap, … }] }] }
            ├─ filters symbols where f > warnThreshold
            └─ writes warning to stdout (exit 0)  — F > warn
               or exits 2                           — F > block
```

**CLI output structure consumed by the hook:**

```json
{
  "timestamp": "2026-05-22T…",
  "summary": { "fileCount": N, "symbolCount": N, "…": "…" },
  "files": [
    {
      "uri": "file:///…",
      "path": "src/core/analyze.ts",
      "rollupScore": 432.1,
      "symbols": [
        { "name": "computeSymbolMetrics", "cc": 12, "t": 0.87,
          "crap": 18.3, "r": 46.3, "f": 847.2, "g": 1.4, "fPrime": 1186.1 }
      ]
    }
  ]
}
```

The hook matches the target `file_path` against `files[].path` (normalised to the repository-relative form), iterates `symbols`, and applies the warn/block thresholds defined in ADR-004.

**Role of the MCP server is unchanged from ADR-004:**

| Surface | Use case | Invocation pattern |
|---------|----------|-------------------|
| CLI (`ddp analyze --format json`) | One-shot analysis; hook backend; CI gates; scripted use | Per request, short-lived |
| MCP server (`ddp-mcp`) | Interactive agent queries during a session (exploratory analysis, caller-tree drill-down, hotspot queries) | Long-lived, multiple requests |

The MCP server is retained without modification. It is the correct surface for a persistent agent session; it is the wrong surface for a per-edit hook.

### Decision 2: `ddp init` Sub-Command

Add a sub-command to the CLI that automates hook installation. Two modes — project-scoped (default) and global — share the same write/patch logic but differ in target directory and path resolution.

#### Command Surface

```bash
# Project-scoped (default) — writes into ./.claude/ in the current directory
ddp init --claude-code
ddp init --claude-code --root <path>     # explicit project root override

# Global — writes into the user's global Claude Code config directory
ddp init --claude-code --global
```

#### Target Paths

| Mode | OS | Target Directory |
|------|-----|------------------|
| Project | All | `<root>/.claude/` (default `<root>` = `process.cwd()`) |
| Global | Linux / macOS | `~/.claude/` (`$XDG_CONFIG_HOME/claude` if set, falling back to `$HOME/.claude`) |
| Global | Windows | `%APPDATA%\Claude\` (i.e. `process.env.APPDATA`) |

Path resolution uses `os.homedir()` and `process.env.APPDATA`; no shell expansion is assumed. If `APPDATA` is unset on Windows the command fails with a clear error rather than guessing.

#### What `ddp init --claude-code` Writes

1. **`<target>/hooks/ddp-pre-edit-check.js`** — the hook script. Identical content across project and global modes; only the embedded path to the CLI binary differs (see Path Resolution below).
2. **`<target>/settings.json`** — patched, not overwritten. The `hooks.PreToolUse` block is added or merged; any existing `mcpServers`, `permissions`, `model`, or other top-level keys are preserved byte-for-byte where possible (JSON is read, the `hooks.PreToolUse` matcher entry is added or replaced, and the file is re-serialised with a stable formatter).

If `settings.json` does not exist, it is created with a minimal scaffold containing only the `hooks.PreToolUse` block.

#### Path Resolution for the Hook Script

The hook script needs to know where the CLI binary lives. The rule:

| Mode | Path embedded in hook script |
|------|------------------------------|
| Project | Relative path from `<target>/hooks/` to the CLI binary, resolved against the installed `dependable-dependencies` package (typically `../../node_modules/dependable-dependencies/out/adapter/cli/bin.js`). If the project depends on DDP via `npm`, this path is stable. |
| Global | Absolute path to the CLI binary. Resolved at install time via `require.resolve('dependable-dependencies/out/adapter/cli/bin.js')` from the executing `ddp` process and written into the hook as a literal absolute string. |

The hook does not invoke `ddp` from `$PATH`. Resolving the binary path at install time avoids ambiguity when multiple Node.js or DDP versions are installed.

#### Idempotency

`ddp init` is safe to re-run. The implementation:

1. Reads existing `settings.json` if present.
2. If the `PreToolUse` matcher for `Edit|Write|MultiEdit` already references `ddp-pre-edit-check.js`, the settings file is left untouched and the command reports "already installed".
3. The hook script is overwritten unconditionally — it is generated, not authored, and a re-run picks up the current binary path.
4. The command always exits 0 on a no-op re-run; only true failures (permission denied, malformed existing settings.json) produce a non-zero exit.

#### Uninstall

Not in scope for this ADR. Tracked as a follow-up: `ddp uninstall --claude-code [--global]` removes the hook script and the matcher entry, preserving every other key in `settings.json`.

### Decision 3: Rename CLI Binary to `ddp`

`package.json` is updated:

```diff
- "bin": { "ddp-analyze": "./out/adapter/cli/bin.js" }
+ "bin": { "ddp":         "./out/adapter/cli/bin.js" }
```

This aligns the bin entry with every existing reference in the codebase (CLI help text, BDD scenarios, CLAUDE.md, `AI_AGENT_INTEGRATION_GUIDE.md`, ADR-004). The `ddp-analyze` alias is not retained: there is no production deployment to break, and a single canonical name avoids two-name confusion.

Downstream consequences:

- `npm install dependable-dependencies` puts a `ddp` executable on `PATH`.
- `npx ddp …` works without a `--package` override.
- The GitHub Actions step in ADR-001 (`npx ddp analyze …`) works as documented; previously it relied on path-based invocation.

### Decision 4: Explicit `exports` Field for Programmatic Use

`package.json` adds an `exports` map alongside `main`:

```json
{
  "main": "./dist/extension.js",
  "exports": {
    ".":     "./out/adapter/cli/cliAnalysis.js",
    "./mcp": "./out/adapter/mcp/index.js"
  }
}
```

| Entry | Consumer | Contains |
|-------|----------|----------|
| `main` | VS Code extension host | Bundled extension (`dist/extension.js`) |
| `exports['.']` | Node.js programmatic consumer | `runCliAnalysis`, types from `cliAnalysis.ts` |
| `exports['./mcp']` | Embedders of the MCP server (or alternative MCP shells) | MCP server factory from `adapter/mcp/index.ts` |

The VS Code extension entry remains separate (`main`) because it must remain a bundled, runtime-coupled file. The CLI surface is exported as the package default for non-VS-Code consumers: `import { runCliAnalysis } from 'dependable-dependencies'` returns the same function the `ddp` binary invokes, and pulls in zero VS Code dependencies.

This is the minimum required surface. Additional sub-paths (`./language/typescript`, `./core`) can be exported later if a clear consumer emerges, but are not exported speculatively.

---

## Implementation Sequence

```
Step 1 (½ day): Rename CLI binary
  ├── package.json: bin.ddp-analyze → bin.ddp
  ├── Regenerate npm shims locally to verify the binary resolves
  └── Update README, CLAUDE.md, and any remaining "ddp-analyze" references

Step 2 (1 day): Re-point hook at CLI
  ├── Rewrite .claude/hooks/ddp-pre-edit-check.js to spawn CLI directly
  ├── Remove MCP handshake code from the hook
  ├── Parse runCliAnalysis JSON output, filter by F threshold
  └── Characterisation tests against fixture CLI output

Step 3 (1–2 days): ddp init command
  ├── src/adapter/cli/init/ — new module
  │     ├── writeHookScript.ts        (template + path injection)
  │     ├── patchSettingsJson.ts      (read, merge PreToolUse, write)
  │     ├── resolveTargetDir.ts       (project vs global, per-OS)
  │     └── resolveCliBinaryPath.ts   (require.resolve)
  ├── Wire `init` sub-command into bin.ts
  ├── Idempotency tests (fresh install, re-install, existing mcpServers preserved)
  └── Cross-platform tests (Linux/macOS path, Windows %APPDATA% path)

Step 4 (½ day): exports field
  ├── package.json: add exports map
  ├── Verify `import { runCliAnalysis } from 'dependable-dependencies'` works
  │     in a sibling test project without pulling in `vscode`
  └── Document the export surface in README

Step 5 (½ day): Documentation
  ├── Update docs/guides/AI_AGENT_INTEGRATION_GUIDE.md — replace manual
  │     install steps with `ddp init --claude-code`
  ├── Update CLAUDE.md — change `npx ddp-analyze` references to `npx ddp`
  └── Mark ADR-004 Layer 2A as revised; cross-link to ADR-006
```

Total: approximately 4 working days.

---

## Consequences

### Positive

- **Lower hook latency**: One process spawn and one JSON parse, no JSON-RPC framing or handshake.
- **Smaller hook surface**: ~30 lines of subprocess + JSON code, no MCP client implementation to maintain in the hook itself.
- **Correct layering**: The MCP server is what it should be — an interactive session backend. The CLI is what it should be — a one-shot analysis tool, including for hook invocations.
- **One canonical install command**: `ddp init --claude-code` replaces a multi-step manual procedure that previously had to be repeated per developer and per OS.
- **Project + global support**: Teams can pin the hook into a single repo; individual developers can install it once globally for all projects.
- **Idempotent installation**: Re-running `ddp init` after an upgrade picks up the new CLI binary path automatically without clobbering user customisations in `settings.json`.
- **Clean import surface**: `import { runCliAnalysis } from 'dependable-dependencies'` works in any Node.js consumer without dragging the VS Code runtime.
- **Name alignment**: One name (`ddp`) across binary, docs, help text, and BDD scenarios.

### Negative

- **Hook depends on CLI build output being present**: If `out/adapter/cli/bin.js` is missing (e.g. fresh clone without `npm run compile`), the hook fails. Mitigation: `ddp init` checks the binary exists at the resolved path and refuses to install if it does not — failing at install time, not at edit time.
- **Settings.json patching has a non-trivial test surface**: The merge logic must preserve unrelated keys, handle existing `PreToolUse` matchers that target other tools, and round-trip comments-free JSON cleanly. Mitigation: characterisation tests over a corpus of representative `settings.json` files.
- **Renaming `ddp-analyze` breaks any external automation that invokes the old name**: There is no shipped npm release with the `ddp-analyze` name in production use, so this risk is contained. Documented in the release notes for the version that ships this change.

### Neutral

- **MCP server is retained but no longer on the hook hot path**: Its role is now narrower (interactive sessions only) but unchanged in implementation.
- **`exports` field does not change `main`**: VS Code extension activation is unaffected.
- **Global mode uses `%APPDATA%\Claude\` on Windows**: This is the documented Claude Code global config directory. If Anthropic relocates this directory in a future version, `resolveTargetDir.ts` is the single point of change.

---

## Alternatives Considered

### Alternative 1: Keep the Hook Calling MCP

Leave the hook calling the MCP server unchanged, on the grounds that "both are already implemented."

**Rejected.** The cost is paid on every edit, forever. The MCP handshake is non-trivial protocol surface that has no value in a one-shot context. The right time to fix layering is before more code accretes on the wrong layer.

### Alternative 2: Make the MCP Server the Single Backend, Drop the CLI Path

Have everything (CI, hook, programmatic use) go through the MCP server.

**Rejected.** MCP is a session protocol; using it for one-shot tools requires either an always-on background process (operational burden, lifecycle complexity) or a process-per-invocation pattern that wastes the protocol's strengths. The CLI is the correct one-shot surface; the MCP server is the correct session surface. Both should exist.

### Alternative 3: Bake the Hook into the Claude Code Default Configuration

Lobby for DDP to ship as a default Claude Code hook.

**Out of scope.** DDP can be installed via `ddp init --claude-code --global` by any developer who wants it. Inclusion in a vendor's defaults is a separate conversation that does not block this work.

### Alternative 4: Use a Shell Script Instead of a Node Hook

Replace the JavaScript hook with a `.sh` / `.bat` pair that calls `ddp` from `$PATH`.

**Rejected.** Cross-platform shell scripting is more fragile than a Node script. The hook already runs in a Node environment provided by Claude Code; using the same runtime as the host avoids a second toolchain dependency. Resolving the CLI binary via `require.resolve` at install time is more robust than `$PATH` lookup at edit time.

### Alternative 5: Keep `ddp-analyze` for Backwards Compatibility

Ship both `ddp` and `ddp-analyze` as bin entries.

**Rejected.** Two names invite confusion ("which one am I supposed to use?"), drift in documentation, and divergent shell completion. There is no installed user base that depends on `ddp-analyze`; the rename is free now and expensive later.

### Alternative 6: Export Everything Under `exports`

Export the entire `src/` tree (`./core`, `./language/typescript`, `./adapter/cli`, etc.) speculatively.

**Rejected.** Each exported sub-path is a public API commitment. Exporting speculatively creates upgrade friction without a known consumer. The two entries chosen (`.` for CLI, `./mcp` for MCP embedders) are the two cases that exist today; additional sub-paths can be added when a real consumer materialises.

---

## Revision to ADR-004

ADR-004 Layer 2A described the PreToolUse hook as calling `ddp analyze` directly. The implementation drifted to call MCP. This ADR reaffirms ADR-004's original intent (hook → CLI), adds the install automation that ADR-004 left as manual, and clarifies the MCP server's role as the session backend rather than the hook backend.

ADR-004 Layer 1 (CLI caller-tree output) and Layer 2B (MCP server) are unchanged. ADR-004 Layer 3 (CLAUDE.md protocol instructions) is unchanged.

---

## Related Documents

- **ADR-001** — CLI Analysis Architecture (origin of `runCliAnalysis`)
- **ADR-004** — AI Agent Integration (three-layer model that this ADR refines)
- **ADR-005** — Language-Native Analysis (ensures CLI output is complete enough to drive the hook directly)
- **`docs/guides/AI_AGENT_INTEGRATION_GUIDE.md`** — To be updated to reference `ddp init --claude-code`
- **`CLAUDE.md`** — Code Modification Safety Protocol (consumer of the CLI output the hook now parses)
- **`.claude/hooks/ddp-pre-edit-check.js`** — Hook script, to be rewritten per Decision 1
- **`.claude/settings.json`** — Will be regenerated by `ddp init`; preserves existing `mcpServers` and other keys
