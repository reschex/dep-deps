# Dependable Dependencies (DDP) Risk Analysis

**AI Context File for Claude**

## High-Level Intent

This VS Code extension and CLI tool implements **Dependable Dependencies** (Gorman, 2011) — a risk-based approach to guide testing and refactoring efforts by calculating **F = R × CRAP** for every function/method in a codebase.

**Core Principle**: The most dangerous code is **complex, untested, and widely depended upon**. DDP surfaces these hotspots by combining:

1. **Cyclomatic Complexity (CC)** — McCabe's metric for code complexity
2. **Test Coverage (T)** — fraction of code executed by tests
3. **CRAP** — Change Risk Anti-Pattern: `CC² × (1 − T)³ + CC`
4. **Rank (R)** — PageRank-like importance from the call graph (how many functions depend on this one)
5. **Failure Risk (F)** — `R × CRAP` — final risk score prioritizing functions for testing/refactoring
6. **Churn (G)** — optional multiplier based on git commit frequency to surface actively changing risky code

### What Makes This Approach Valuable

- **Data-driven prioritization**: Instead of guessing where to add tests, the tool tells you
- **Dependency amplification**: A bug in a widely-used function cascades through all dependents (captured by R)
- **Actionable**: High F → write tests (reduces CRAP), refactor (reduces CC), or decouple dependencies (reduces R)
- **Multi-language**: Supports TypeScript, JavaScript, Python, and Java

## Primary Use Cases

1. **VS Code Extension** — Real-time risk analysis with editor decorations, sidebar tree view, and code lens
2. **CLI Tool** — Headless analysis for CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
3. **GitHub Actions Integration** — Automated risk reports with sortable HTML tables in PR summaries
4. **AI Agent Integration** — Risk-aware code modification: agents warned before editing high-risk symbols via PreToolUse hooks and MCP tools

## Documentation Structure

### For Understanding the System

- **[README.md](./README.md)** — User-facing documentation: installation, usage, configuration
- **[docs/architecture/](./docs/architecture/)** — Architectural decisions and design:
  - `ADR-001-cli-analysis-architecture.md` — Architecture Decision Record for CLI/CI implementation
  - `ADR-004-ai-agent-integration.md` — Architecture Decision Record for AI agent integration (PreToolUse hook, MCP server)
  - `ARCHITECTURE_SUMMARY.md` — High-level architecture overview and component stack
  - `DEPENDABLE_DEPENDENCIES_PLAN.md` — Original project plan and metrics specification

### For Implementation

- **[docs/guides/](./docs/guides/)** — Step-by-step implementation guides:
  - `IMPLEMENTATION_GUIDE_CLI.md` — Detailed CLI implementation with code examples
  - `QUICKSTART_CLI.md` — Quick start for implementing CLI features
  - `AI_AGENT_INTEGRATION_GUIDE.md` — Implementing PreToolUse hooks and MCP server for AI agent integration

### For Development & Testing

- **[docs/development/](./docs/development/)** — Development process documentation:
  - `TODO.md` — Current development tasks and roadmap
  - `BDD_SCENARIOS.md` — Behavior-Driven Development scenarios (living specification)
  - `features.md` — Feature file documentation (Gherkin scenarios)

- **[docs/testing/](./docs/testing/)** — Testing strategies and analysis:
  - `MUTATION_TESTING.md` — Mutation testing guide with Stryker
  - `COVERAGE_INTEGRATION_ANALYSIS.md` — Deep dive into coverage data handling

## Key Architecture Patterns

### Hexagonal Architecture (Ports & Adapters)

The system uses **dependency inversion** to keep domain logic portable:

```
Domain Core (ports defined)
    ↑
    │ implements
    ↓
Adapters (VS Code or Node.js)
```

- **Ports** (`src/core/ports.ts`): Interfaces for `DocumentProvider`, `SymbolProvider`, `CoverageProvider`, `CallGraphProvider`, etc.
- **Language Layer** (`src/language/`): CC providers, file patterns, TS symbol extraction — shared across tools
- **VS Code Adapters** (`src/adapter/vscode/adapters.ts`): Use VS Code LSP APIs
- **Node.js Adapters** (`src/adapter/cli/`): Use TypeScript Compiler API and file system

**Benefit**: The same `AnalysisOrchestrator` runs in both VS Code and CLI contexts without modification.

### Test-Driven Development (TDD)

**Every production feature is test-first**. The workflow is strict RED-GREEN-REFACTOR:

1. **RED** — Write a failing test
2. **GREEN** — Make it pass with minimal code
3. **REFACTOR** — Clean up while keeping tests green

Current test coverage: **>98%** (see coverage reports in `coverage/lcov-report/`)

**Mutation testing** with Stryker validates test quality (not just coverage).

## Codebase Navigation

### Core Domain Logic (Infrastructure-Agnostic)

- `src/core/` — Pure domain logic:
  - `analyze.ts` — Main analysis orchestration (`computeSymbolMetrics`)
  - `rank.ts` — PageRank computation for call graph importance
  - `metrics.ts` — CRAP and failure risk (F) calculations
  - `churn.ts` — Git churn multiplier (G)
  - `coverageMap.ts` — Coverage fraction calculation per symbol
  - `lcovParse.ts`, `jacocoParse.ts` — Coverage file parsers
  - `ccRegistry.ts` — CC provider registry (strategy dispatch)

### Language Knowledge (Shared Across Tools)

- `src/language/` — Language-specific logic, no tool dependency:
  - `estimateCc.ts` — Fallback cyclomatic complexity via regex
  - `patterns.ts` — Aggregated file globs, test-file detection
  - `parseComplexity.ts` — Shared CC message parsing
  - `typescript/` — TypeScript/JavaScript:
    - `symbols.ts` — TS Compiler API symbol extraction
    - `cc/` — ESLint CC provider (eslintComplexity, eslintSpawn, eslintParse)
  - `python/` — Python:
    - `cc/` — Radon CC provider (radonCc, radonSpawn, radonParse)
  - `java/` — Java:
    - `nativeSymbols.ts` — Native symbol extraction from source (no PMD needed)
    - `callGraphParse.ts` — Java source parser (classes, methods, fields)
    - `callGraphBuild.ts` — Cross-file call edge builder
    - `callGraph.ts` — `JavaCallGraphProvider`
    - `cc/` — PMD CC provider (pmdComplexity, pmdSpawn, pmdParse)
  - `nativeCallGraphProvider.ts` — Multi-language call graph dispatch (TS + Java)

### Shared Infrastructure

- `src/shared/` — Tool-agnostic utilities:
  - `spawnCollect.ts` — Subprocess spawning and output collection
  - `fakeProc.ts` — Test helper for mocking child processes

### VS Code Extension

- `src/extension.ts` — Extension entry point
- `src/adapter/vscode/` — VS Code-specific implementation:
  - `register.ts` — Command registration
  - `analysisOrchestrator.ts` — Orchestrates domain logic with VS Code adapters
  - `adapters.ts` — VS Code implementations of ports (LSP, workspace APIs)
  - `analysisService.ts` — Wires language/* + LSP into AnalysisOrchestrator
  - `configuration.ts` — VS Code settings reader
  - `churn/` — Git churn adapter
  - `ui/` — Presentation concerns:
    - `riskTreeProvider.ts` — Sidebar tree view
    - `decorationManager.ts` — Editor decorations (squiggles)
    - `codeLensProvider.ts` — Inline metrics display
    - `hoverProvider.ts` — Hover tooltips

### CLI Tool

- `src/adapter/cli/` — Headless CLI implementation:
  - `nodeDocument.ts` — File discovery via glob

## Key Metrics Reference

| Metric | Formula | Range | Meaning |
|--------|---------|-------|---------|
| **CC** | McCabe | 1–∞ | Cyclomatic complexity (branches) |
| **T** | Coverage | 0.0–1.0 | Test coverage fraction |
| **CRAP** | `CC² × (1 − T)³ + CC` | 0–∞ | Change risk (high CC + low T = high CRAP) |
| **R** | PageRank | 1.0–∞ | Call graph importance (dependency count) |
| **F** | `R × CRAP` | 0–∞ | **Failure risk** (primary metric) |
| **G** | `1 + ln(1 + commits)` | 1.0–∞ | Churn multiplier (git frequency) |
| **F′** | `F × G` | 0–∞ | Churn-adjusted failure risk |

**Interpretation**:
- High F → High-risk function: complex, untested, widely used
- High F′ → High-risk + frequently changing → **urgent priority**

## Sources & References

- **Dependable Dependencies Paper**: [https://codemanship.co.uk/Dependable%20Dependencies.pdf](https://codemanship.co.uk/Dependable%20Dependencies.pdf)
- **CRAP Metric**: Change Risk Anti-Pattern (CRAP4J)
- **PageRank**: Google's algorithm adapted for code dependency graphs

## Code Modification Safety Protocol

Before modifying **any** `.ts`, `.js`, `.py`, or `.java` source file in this codebase:

1. **Run DDP analysis** on the target file:
   ```bash
   npx ddp analyze --file <path> --format json
   ```

2. **If any symbol has F > 100**, run the caller tree for that symbol:
   ```bash
   npx ddp callers --file <path> --symbol <name> --format text
   ```

3. **Apply risk thresholds:**

   | F Score | Risk Level | Action |
   |---------|-----------|--------|
   | > 500 | CRITICAL | **Stop.** Inform the user, show the caller tree summary, require explicit confirmation before editing. |
   | 200–500 | HIGH | **Warn.** Show highest-risk callers. Recommend writing tests to close the coverage gap before editing. |
   | 100–200 | MEDIUM | **Note** the risk in your response. Continue unless the user indicates concern. |
   | ≤ 100 | LOW | Proceed normally. |

4. **Interpret the metrics:**
   - **High R** (R > 10): Many functions depend on this one — a bug cascades widely through callers
   - **High CC** (CC > 10): Complex branching logic; subtle bugs are easy to introduce
   - **Low T** (T < 0.5): Under-tested; changes are likely to regress silently
   - **To reduce F**: write tests (↑ T → ↓ CRAP), refactor (↓ CC → ↓ CRAP), or decouple dependents (↓ R)

> **If the PreToolUse hook is installed** (`.claude/settings.json`), this check runs automatically before every edit. The hook will warn (F > 100) or block (F > 500) without you needing to remember to run it.

> **See:** [AI Agent Integration Guide](./docs/guides/AI_AGENT_INTEGRATION_GUIDE.md) for the hook and MCP server implementation.

---

## Development Workflow

### Running Tests

```bash
npm test                    # Run all tests (Vitest)
npm run mutation            # Run mutation tests (Stryker)
npm run coverage            # Generate coverage report
```

### Building & Running

```bash
npm run compile             # Compile TypeScript
npm run package             # Build .vsix extension
npm run cli:dev             # Run CLI locally
```

### Common Tasks

- **Add new feature**: Start with BDD scenario in `features/`, write failing tests, implement
- **Fix bug**: Write failing test reproducing the bug, fix, refactor
- **Add language support**: Implement new adapters for symbol extraction and CC calculation

## Testing Philosophy

1. **Test behavior, not implementation** — Tests describe *what* the system does, not *how*
2. **Fast feedback** — Unit tests run in <3 seconds for the full suite
3. **Test coverage ≠ quality** — Mutation testing validates that tests actually detect bugs
4. **Real code over mocks** — Use real implementations when feasible; mocks only for external dependencies

## Common Pitfalls & Solutions

### "Why is my function showing F=0?"

- Check if coverage data is available (`**/coverage/lcov.info`)
- Verify the symbol was extracted (check sidebar tree)
- Ensure cyclomatic complexity tool is configured (ESLint for TS/JS, Radon for Python, PMD for Java)

### "Rank (R) is always 1"

- TypeScript/JavaScript and Java have full call graph support (R > 1)
- Python call graph is not yet implemented (R=1 always — see backlog)
- Verify call graph edges exist: check `edgesCount` in analysis output
- Check `NativeCallGraphProvider` dispatches correctly for your file type

### "Tests are slow"

- Avoid network calls in unit tests
- Use test fixtures instead of real file I/O where possible
- Run specific test files during development: `npm test -- src/path/to/test.ts`

## Extension Points

To add support for a new language:

1. Create `src/language/<lang>/` directory with `patterns.ts` (language IDs, file globs, test patterns)
2. Implement `CyclomaticComplexityProvider` in `src/language/<lang>/cc/` (spawn tool, parse output)
3. Register language in `CcProviderRegistry` via `analysisService.ts`
4. Add file extensions to `src/language/patterns.ts` aggregate glob
5. (Optional) Implement `SymbolProvider` in `src/language/<lang>/symbols.ts` for CLI support
6. Add BDD scenarios and tests

## Questions for Claude

When working on this codebase:

- **"Where should I add X?"** → Check the hexagonal architecture layers (core vs adapters)
- **"How do I test Y?"** → Follow TDD workflow: RED-GREEN-REFACTOR
- **"Why is this designed this way?"** → See ADRs in `docs/architecture/`
- **"What's the test strategy for Z?"** → See `docs/testing/` and existing test files

## Quick Links

- [Main README](./README.md) — Usage and configuration
- [Architecture Decision Records](./docs/architecture/) — Why we made certain decisions
- [Implementation Guides](./docs/guides/) — How to implement new features
- [BDD Scenarios](./docs/development/BDD_SCENARIOS.md) — Living specification
- [Test Strategy](./docs/testing/) — Coverage and mutation testing
- [AI Agent Integration Guide](./docs/guides/AI_AGENT_INTEGRATION_GUIDE.md) — Hook and MCP server setup
- [ADR-004: AI Agent Integration](./docs/architecture/ADR-004-ai-agent-integration.md) — Architecture decisions
