# ddp-analyze CLI

Command-line interface for **Dependable Dependencies** risk analysis. Scans TypeScript, JavaScript, Python, and Java source files to compute failure risk scores for every function and method, then outputs structured results for CI/CD pipelines, GitHub Actions, or local inspection.

Based on [Dependable Dependencies (Gorman, 2011)](https://codemanship.co.uk/Dependable%20Dependencies.pdf).

## Quick Start

```bash
# Build (required once, or after code changes)
npm run compile

# Analyse the current directory
node out/adapter/cli/bin.js

# Analyse a specific project
node out/adapter/cli/bin.js --root ./my-project

# Write results to a file
node out/adapter/cli/bin.js --root ./my-project --output report.json

# Verbose output (logs to stderr, JSON to stdout)
node out/adapter/cli/bin.js --root ./my-project --verbose
```

If installed globally or via `npx`:

```bash
npx ddp-analyze --root ./my-project --output report.json
```

## Usage

```
ddp-analyze [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--root <path>` | Project root directory to analyse | Current working directory |
| `--output <file>` | Write output to a file instead of stdout | stdout |
| `--format <type>` | Output format: `json` | `json` |
| `--exclude-tests` | Exclude test files from analysis | Enabled by default |
| `--no-exclude-tests` | Include test files in analysis | |
| `--verbose` | Log progress to stderr | Off |
| `--help` | Show help message and exit | |
| `--version` | Show version number and exit | |

### Examples

```bash
# Analyse current directory, JSON to stdout
ddp-analyze

# Analyse a monorepo sub-package, save results
ddp-analyze --root packages/api --output api-risk.json

# Include test files in the analysis
ddp-analyze --no-exclude-tests

# Verbose mode (progress logs go to stderr, JSON to stdout)
ddp-analyze --root . --verbose > report.json

# Pipe into jq to find the riskiest symbols
ddp-analyze --root . | jq '.files[].symbols | sort_by(-.f) | .[0:5]'
```

## Output Format

The CLI produces a JSON document with three top-level fields:

```jsonc
{
  "timestamp": "2026-04-30T12:00:00.000Z",
  "summary": {
    "filesAnalyzed": 69,
    "symbolsAnalyzed": 222,
    "averageCC": 3.4
  },
  "files": [
    {
      "uri": "file:///path/to/src/utils.ts",
      "path": "src/utils.ts",
      "rollupScore": 125.5,
      "symbols": [
        {
          "name": "processData",
          "cc": 8,
          "t": 0.45,
          "crap": 17.23,
          "r": 3.2,
          "f": 55.14,
          "g": 1,
          "fPrime": 55.14
        }
      ]
    }
  ]
}
```

### Fields

**`summary`** -- Aggregate counts for the analysis run.

| Field | Type | Description |
|-------|------|-------------|
| `filesAnalyzed` | number | Total source files processed |
| `symbolsAnalyzed` | number | Total functions/methods found |
| `averageCC` | number | Mean cyclomatic complexity across all symbols |

**`files[]`** -- One entry per source file, sorted by `rollupScore` descending (riskiest first).

| Field | Type | Description |
|-------|------|-------------|
| `uri` | string | Absolute `file://` URI |
| `path` | string | Workspace-relative path |
| `rollupScore` | number | File-level risk (max F across symbols by default) |
| `symbols` | array | Functions/methods in this file |

**`files[].symbols[]`** -- One entry per function or method.

| Field | Type | Formula | Description |
|-------|------|---------|-------------|
| `name` | string | | Function or method name |
| `cc` | number | McCabe | Cyclomatic complexity (branch count) |
| `t` | number | | Test coverage fraction (0.0 = untested, 1.0 = fully covered) |
| `crap` | number | CC^2 x (1-T)^3 + CC | Change Risk Anti-Pattern score |
| `r` | number | PageRank | Call graph importance (1.0 when no call graph) |
| `f` | number | R x CRAP | Failure risk -- the primary metric |
| `g` | number | 1 + ln(1 + commits) | Churn multiplier (1.0 when churn is disabled) |
| `fPrime` | number | F x G | Churn-adjusted failure risk |

## Understanding the Metrics

The core idea: **the most dangerous code is complex, untested, and widely depended upon**.

| Situation | What It Means | What To Do |
|-----------|---------------|------------|
| High CC, low T | Complex code with little test coverage | Write tests targeting the uncovered branches |
| High R | Many other functions call this one | A bug here cascades widely -- prioritise correctness |
| High F (> 100) | Significant failure risk | Add tests (reduces CRAP), refactor (reduces CC), or decouple (reduces R) |
| High F' | High risk AND frequently changing | Most urgent -- this code is both fragile and actively evolving |

### Risk Thresholds

| F Score | Level | Recommendation |
|---------|-------|----------------|
| 0--50 | Low | Proceed normally |
| 50--200 | Medium | Note the risk; consider adding tests before modifying |
| 200--500 | High | Write tests first; review the caller tree before editing |
| > 500 | Critical | Stop and discuss; refactoring or decoupling needed before changes |

## How It Works

The CLI runs four stages:

1. **File discovery** -- Finds source files matching `**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}`, excluding `node_modules/`, `out/`, `dist/`, and `.git/`.

2. **Symbol extraction** -- Parses each file with the TypeScript Compiler API to extract function declarations, method declarations, arrow functions, getters/setters, and generator functions.

3. **Coverage loading** -- Reads LCOV coverage files (default glob: `**/coverage/lcov.info`) and maps line-level hit data onto each symbol's body range to compute T.

4. **Metric computation** -- Calculates CC (via regex-based estimation in CLI mode), CRAP, R (currently 1.0 -- no call graph in CLI), and F for every symbol. Rolls up per-file risk scores.

### Cyclomatic Complexity in CLI Mode

The CLI uses a **regex-based CC estimator** as a fallback since ESLint/Radon/PMD are not spawned automatically. This counts branching keywords (`if`, `else`, `for`, `while`, `case`, `catch`, `&&`, `||`, `??`, ternaries) to approximate McCabe complexity. Results are directionally accurate but may differ slightly from tool-specific CC.

### What Is NOT Available in CLI (Yet)

- **Call graph analysis** -- R is always 1.0 (no dependency amplification). The VS Code extension uses LSP call hierarchy for this.
- **Churn weighting** -- G is always 1.0. Git churn integration is planned.
- **GitHub summary format** -- `--format github-summary` is not yet implemented.
- **`ddp callers` sub-command** -- Caller tree / impact analysis is planned.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run DDP analysis
  run: |
    npm run compile
    node out/adapter/cli/bin.js --root . --output ddp-report.json

- name: Upload risk report
  uses: actions/upload-artifact@v4
  with:
    name: ddp-risk-report
    path: ddp-report.json
```

### Fail on High Risk

```yaml
- name: Check for critical risk
  run: |
    node out/adapter/cli/bin.js --root . --output report.json
    # Fail if any symbol has F > 500
    node -e "
      const r = require('./report.json');
      const critical = r.files.flatMap(f => f.symbols).filter(s => s.f > 500);
      if (critical.length) {
        console.error('Critical risk symbols:', critical.map(s => s.name));
        process.exit(1);
      }
    "
```

### GitLab CI

```yaml
ddp-analysis:
  script:
    - npm run compile
    - node out/adapter/cli/bin.js --root . --output ddp-report.json
  artifacts:
    paths:
      - ddp-report.json
```

## Prerequisites

### Coverage Data (Optional but Recommended)

Without coverage data, all symbols get T = 0 (worst case) which inflates CRAP scores. Generate LCOV before running the CLI:

**JavaScript/TypeScript (Vitest):**
```bash
npx vitest run --coverage
# Creates coverage/lcov.info
```

**JavaScript/TypeScript (Jest):**
```bash
npx jest --coverage --coverageReporters=lcov
# Creates coverage/lcov.info
```

**Python:**
```bash
pip install coverage coverage-lcov
python -m coverage run -m pytest
python -m coverage lcov
# Creates coverage.lcov
```

**Java (Maven + JaCoCo):**
```bash
mvn clean test
# JaCoCo generates target/site/jacoco/jacoco.xml
```

### Supported Languages

| Language | File Extensions | CC Method (CLI) | Coverage Format |
|----------|----------------|-----------------|-----------------|
| TypeScript | `.ts`, `.tsx` | Regex estimation | LCOV |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | Regex estimation | LCOV |
| Python | `.py` | Regex estimation | LCOV |
| Java | `.java` | Regex estimation | LCOV, JaCoCo XML |

## Relationship to the VS Code Extension

The CLI and VS Code extension share the same domain logic (`src/core/`) but use different adapters:

| Capability | VS Code Extension | CLI |
|------------|-------------------|-----|
| File discovery | VS Code workspace API | Node.js `glob` |
| Symbol extraction | VS Code LSP | TypeScript Compiler API |
| CC calculation | ESLint / Radon / PMD | Regex estimation (fallback) |
| Call graph (R) | VS Code call hierarchy LSP | Not available (R = 1) |
| Coverage | VS Code file watcher | Direct LCOV file reads |
| Output | Sidebar, decorations, code lens | JSON to stdout or file |

The VS Code extension provides richer analysis (real CC tools, call graph for R > 1, live updates). The CLI is designed for automation, CI/CD, and headless environments.
