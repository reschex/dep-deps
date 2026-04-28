# AI Agent Integration Guide

**Implementing Risk-Aware Code Modification for AI Coding Agents**

> **Related:** [ADR-002](../architecture/ADR-004-ai-agent-integration.md) — Architecture decisions and rationale  
> **Feature Scenarios:** [`features/ai-agent-integration.feature`](../../features/ai-agent-integration.feature)

---

## Goal

Surface DDP risk data to AI coding agents (Claude Code, Cursor, Copilot) at the point of code modification — both when they ask and before they edit. The outcome: agents know the blast radius before they touch a high-risk function.

## Prerequisites

- ADR-004 read and understood
- CLI Phase 1 (JSON output) implemented — see [IMPLEMENTATION_GUIDE_CLI.md](./IMPLEMENTATION_GUIDE_CLI.md)
- `ddp analyze --file <path> --format json` working

## Implementation Phases

---

### Phase 1: CLI Caller-Tree Output

**Time estimate:** 3–4 hours  
**Depends on:** existing `callerTree.ts`, `graphTraversal.ts`, `AnalysisResult.edges`

Add a `callers` sub-command alongside `ddp analyze`:

```
ddp callers --file <path> --symbol <name> [--depth N] [--format json|text|markdown]
```

#### Step 1a: Entry Point

Add `callers` command to the CLI entry point (`src/adapter/cli/analyze.ts` or equivalent):

```typescript
program
  .command('callers')
  .requiredOption('--file <path>', 'Source file path')
  .requiredOption('--symbol <name>', 'Symbol name to trace')
  .option('--depth <n>', 'Maximum caller depth', '5')
  .option('--format <fmt>', 'Output format: json | text | markdown', 'text')
  .action(async (opts) => {
    const result = await runCallersAnalysis(opts.file, opts.symbol, parseInt(opts.depth));
    const formatted = formatCallersOutput(result, opts.format);
    process.stdout.write(formatted);
  });
```

#### Step 1b: Serialiser — Text Format

The text format must be optimised for LLM readability. The `flattenTree()` function in `callerTree.ts` already produces the indented structure; wrap it with a header and footer:

```typescript
function formatCallersText(result: CallersResult): string {
  const { symbol, metrics, callerTree, impactSummary } = result;
  const riskLabel = riskLevel(metrics.f); // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

  const header = [
    `DDP RISK: ${result.file} :: ${symbol}`,
    '─'.repeat(54),
    `  F=${metrics.f.toFixed(1)}  R=${metrics.r.toFixed(1)}  CC=${metrics.cc}  T=${(metrics.t * 100).toFixed(0)}%  CRAP=${metrics.crap.toFixed(1)}  [${riskLabel}]`,
    '',
    'CALLER TREE (who depends on this symbol):',
  ].join('\n');

  const tree = flattenToText(callerTree); // indented lines

  const footer = [
    '',
    'IMPACT SUMMARY:',
    `  Direct callers: ${impactSummary.directCallers}  |  Total affected: ${impactSummary.totalAffected}  |  Combined F: ${impactSummary.combinedF.toFixed(1)}`,
    `  Highest-risk caller: ${impactSummary.highestRiskCaller.id} (F=${impactSummary.highestRiskCaller.f.toFixed(1)})`,
  ].join('\n');

  return [header, tree, footer].join('\n');
}
```

**Risk level thresholds:**

| Label | F Range |
|-------|---------|
| LOW | F ≤ 50 |
| MEDIUM | 50 < F ≤ 200 |
| HIGH | 200 < F ≤ 500 |
| CRITICAL | F > 500 |

#### Step 1c: Serialiser — JSON Format

```typescript
interface CallersResult {
  symbol: string;
  file: string;
  metrics: { cc: number; t: number; crap: number; r: number; f: number };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  impactSummary: {
    directCallers: number;
    totalAffected: number;
    combinedF: number;
    highestRiskCaller: { id: string; f: number };
  };
  callerTree: CallerTreeNode[];
}

interface CallerTreeNode {
  id: string;
  depth: number;
  recursive: boolean;
  metrics: { f: number; r: number };
  callers: CallerTreeNode[];
}
```

This maps directly to the existing `CallerNode` type — serialise with `JSON.stringify(result, null, 2)`.

#### Step 1d: Tests

Follow TDD — write these tests first (RED), then implement:

```typescript
describe('formatCallersText', () => {
  it('includes risk header with all metric fields');
  it('labels F=847 as HIGH RISK');
  it('labels F=25 as LOW');
  it('indents nested callers by depth');
  it('marks recursive nodes');
  it('includes IMPACT SUMMARY section');
});

describe('formatCallersJson', () => {
  it('produces valid JSON');
  it('includes callerTree array');
  it('includes impactSummary with directCallers and totalAffected');
  it('includes riskLevel field');
});
```

---

### Phase 2: PreToolUse Hook

**Time estimate:** 2–3 hours  
**Depends on:** Phase 1 CLI output

#### Step 2a: Create Hook Script

Create `.claude/hooks/ddp-pre-edit-check.js`:

```javascript
#!/usr/bin/env node
/**
 * DDP PreToolUse hook — runs before Edit, Write, MultiEdit tool calls.
 * Warns or blocks based on DDP risk scores for the target file.
 *
 * Input:  JSON on stdin — { tool_name, tool_input: { path | file_path | ... } }
 * Output: Warning text on stdout (injected into agent context by Claude Code)
 * Exit:   0 = proceed, 2 = block edit
 */

const { execSync } = require('child_process');

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.java']);
const SKIP_PATTERNS = [/\.test\./, /\.spec\./, /node_modules/];

// Read tool input from stdin
let input;
try {
  const raw = require('fs').readFileSync('/dev/stdin', 'utf8');
  input = JSON.parse(raw);
} catch {
  process.exit(0); // Can't parse — don't block
}

// Extract file path from tool input (varies by tool)
const filePath =
  input?.tool_input?.path ||
  input?.tool_input?.file_path ||
  input?.tool_input?.target_file;

if (!filePath) process.exit(0);

// Skip non-source files
const ext = require('path').extname(filePath);
if (!SOURCE_EXTENSIONS.has(ext)) process.exit(0);
if (SKIP_PATTERNS.some((p) => p.test(filePath))) process.exit(0);

// Load thresholds from .ddprc.json if present
let warnThreshold = 100;
let blockThreshold = 500;
try {
  const rc = JSON.parse(require('fs').readFileSync('.ddprc.json', 'utf8'));
  warnThreshold = rc?.agentIntegration?.warnThreshold ?? warnThreshold;
  blockThreshold = rc?.agentIntegration?.blockThreshold ?? blockThreshold;
} catch { /* use defaults */ }

// Run DDP analysis
let analysisResult;
try {
  const output = execSync(`npx ddp analyze --file "${filePath}" --format json`, {
    timeout: 15000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  analysisResult = JSON.parse(output);
} catch {
  // DDP unavailable — don't block, just note it
  process.stdout.write(`[DDP] Analysis unavailable for ${filePath} — proceeding without risk check.\n`);
  process.exit(0);
}

// Find high-risk symbols
const highRisk = (analysisResult.symbols ?? []).filter((s) => s.f > warnThreshold);
if (highRisk.length === 0) process.exit(0);

const critical = highRisk.filter((s) => s.f > blockThreshold);
const warn = highRisk.filter((s) => s.f <= blockThreshold);

// Build warning message
const lines = [
  `⚠️  DDP RISK WARNING: ${filePath}`,
  '─'.repeat(50),
];

if (critical.length > 0) {
  lines.push('CRITICAL RISK — edit blocked:');
  for (const s of critical) {
    lines.push(`  • ${s.name}  F=${s.f.toFixed(1)}  R=${s.r.toFixed(1)}  CC=${s.cc}`);
  }
  lines.push('');
  lines.push('Review the caller tree before proceeding:');
  for (const s of critical) {
    lines.push(`  npx ddp callers --file "${filePath}" --symbol "${s.name}"`);
  }
  lines.push('');
  lines.push('To proceed: acknowledge the risk and retry with explicit confirmation.');
} else {
  lines.push('HIGH RISK symbols in this file:');
  for (const s of warn) {
    lines.push(`  • ${s.name}  F=${s.f.toFixed(1)}  R=${s.r.toFixed(1)}  CC=${s.cc}`);
  }
  lines.push('');
  lines.push('Consider running `ddp callers --symbol <name>` to review impact before editing.');
}

process.stdout.write(lines.join('\n') + '\n');
process.exit(critical.length > 0 ? 2 : 0);
```

#### Step 2b: Register in Settings

Add to `.claude/settings.json` (create if it doesn't exist):

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

> **Note:** `.claude/settings.json` is checked into the repository — this means the hook is applied for all contributors using Claude Code on this project.

#### Step 2c: Make the Hook Executable

```bash
chmod +x .claude/hooks/ddp-pre-edit-check.js
```

#### Step 2d: Test the Hook Manually

```bash
# Simulate an Edit tool call for a high-risk file
echo '{"tool_name":"Edit","tool_input":{"path":"src/core/analyze.ts"}}' | \
  node .claude/hooks/ddp-pre-edit-check.js
echo "Exit code: $?"
```

Expected output: warning block with high-risk symbols listed. Expected exit code: `2` if any symbol F > 500, `0` otherwise.

---

### Phase 3: MCP Server

**Time estimate:** 4–6 hours  
**Depends on:** Phase 1 CLI output

The MCP server is a thin Node.js process that exposes DDP CLI commands as MCP tools over stdio.

#### Step 3a: Create MCP Server

Create `mcp-server/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'child_process';

const server = new Server({ name: 'ddp', version: '1.0.0' }, {
  capabilities: { tools: {} }
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'ddp_analyze_file',
      description: 'Get DDP risk metrics for all symbols in a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path to analyse' } },
        required: ['path']
      }
    },
    {
      name: 'ddp_caller_tree',
      description: 'Get the caller tree and impact summary for a specific symbol',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          symbol: { type: 'string' },
          depth: { type: 'number', default: 5 }
        },
        required: ['path', 'symbol']
      }
    },
    {
      name: 'ddp_high_risk_symbols',
      description: 'Get symbols in a file above a given F threshold',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          fMin: { type: 'number', default: 100 }
        },
        required: ['path']
      }
    },
    {
      name: 'ddp_workspace_hotspots',
      description: 'Get the top N riskiest symbols across the entire workspace',
      inputSchema: {
        type: 'object',
        properties: { topN: { type: 'number', default: 10 } }
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let output: string;
    if (name === 'ddp_analyze_file') {
      output = execSync(`npx ddp analyze --file "${args.path}" --format json`, { encoding: 'utf8' });
    } else if (name === 'ddp_caller_tree') {
      output = execSync(
        `npx ddp callers --file "${args.path}" --symbol "${args.symbol}" --depth ${args.depth ?? 5} --format json`,
        { encoding: 'utf8' }
      );
    } else if (name === 'ddp_high_risk_symbols') {
      const result = JSON.parse(
        execSync(`npx ddp analyze --file "${args.path}" --format json`, { encoding: 'utf8' })
      );
      const filtered = result.symbols.filter((s: { f: number }) => s.f > (args.fMin ?? 100));
      filtered.sort((a: { f: number }, b: { f: number }) => b.f - a.f);
      output = JSON.stringify(filtered, null, 2);
    } else if (name === 'ddp_workspace_hotspots') {
      const result = JSON.parse(
        execSync(`npx ddp analyze --format json`, { encoding: 'utf8' })
      );
      const all = result.symbols ?? [];
      all.sort((a: { f: number }, b: { f: number }) => b.f - a.f);
      output = JSON.stringify(all.slice(0, args.topN ?? 10), null, 2);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Step 3b: Register with Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "ddp": {
      "command": "npx",
      "args": ["ts-node", "mcp-server/index.ts"]
    }
  }
}
```

---

## CLAUDE.md Instructions (Phase 4 — Immediate)

Add the following section to the project `CLAUDE.md`. This is effective immediately and provides a safety net while the hook and MCP server are being built:

```markdown
## Code Modification Safety Protocol

Before modifying **any** `.ts`, `.js`, `.py`, or `.java` source file:

1. Run DDP analysis on the file:
   ```bash
   npx ddp analyze --file <path> --format json
   ```
2. If any symbol has **F > 100**, run the caller tree for that symbol:
   ```bash
   npx ddp callers --file <path> --symbol <name> --format text
   ```
3. Apply risk thresholds:
   - **F > 500 (CRITICAL):** Stop. Inform the user of the risk, show the caller tree summary, and require explicit confirmation before editing.
   - **F > 200 (HIGH):** Warn the user. Show the highest-risk callers. Recommend writing tests to reduce coverage gap before editing.
   - **F > 100 (MEDIUM):** Note the risk in your response. Continue if user has not indicated concern.
   - **F ≤ 100 (LOW):** Proceed normally.

4. Interpret the metrics:
   - **High R** (R > 10): Many other functions depend on this one — a bug here cascades widely
   - **High CC** (CC > 10): Complex logic; easy to introduce subtle bugs
   - **Low T** (T < 0.5): Under-tested; changes are more likely to regress silently
   - **Reducing F**: write tests (↑ T → ↓ CRAP), refactor (↓ CC → ↓ CRAP), or decouple (↓ R)
```

---

## Success Criteria

- [ ] `ddp callers --format text` produces human-readable output an agent can reason about
- [ ] `ddp callers --format json` produces valid JSON matching the `CallersResult` schema
- [ ] PreToolUse hook fires before `Edit`, `Write`, `MultiEdit` on source files
- [ ] Hook exits 0 for low-risk files (no output)
- [ ] Hook exits 0 with warning output for high-risk files (F 100–500)
- [ ] Hook exits 2 (blocking) for critical-risk files (F > 500)
- [ ] Hook exits 0 silently for non-source files
- [ ] MCP server exposes four tools and returns valid JSON
- [ ] All hook and CLI behaviour covered by unit tests (>95% coverage)
- [ ] VS Code extension unaffected

## Total Estimated Time

| Phase | Effort |
|-------|--------|
| Phase 1: CLI caller-tree output | 3–4 hours |
| Phase 2: PreToolUse hook | 2–3 hours |
| Phase 3: MCP server | 4–6 hours |
| Phase 4: CLAUDE.md instructions | 30 minutes |
| **Total** | **9–13 hours** |
