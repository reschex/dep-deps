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

## Documentation Structure

### For Understanding the System

- **[README.md](./README.md)** — User-facing documentation: installation, usage, configuration
- **[docs/architecture/](./docs/architecture/)** — Architectural decisions and design:
  - `ADR-001-cli-analysis-architecture.md` — Architecture Decision Record for CLI/CI implementation
  - `ARCHITECTURE_SUMMARY.md` — High-level architecture overview and component stack
  - `DEPENDABLE_DEPENDENCIES_PLAN.md` — Original project plan and metrics specification

### For Implementation

- **[docs/guides/](./docs/guides/)** — Step-by-step implementation guides:
  - `IMPLEMENTATION_GUIDE_CLI.md` — Detailed CLI implementation with code examples
  - `QUICKSTART_CLI.md` — Quick start for implementing CLI features

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
- **VS Code Adapters** (`src/ddp/adapters.ts`): Use VS Code LSP APIs
- **Node.js Adapters** (`src/cli/adapters/`): Use TypeScript Compiler API and file system

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
  - `estimateCc.ts` — Fallback cyclomatic complexity via regex

### VS Code Extension

- `src/extension.ts` — Extension entry point
- `src/ddp/` — VS Code-specific implementation:
  - `register.ts` — Command registration
  - `analysisOrchestrator.ts` — Orchestrates domain logic with VS Code adapters
  - `adapters.ts` — VS Code implementations of ports (LSP, workspace APIs)
  - `riskTreeProvider.ts` — Sidebar tree view
  - `decorationManager.ts` — Editor decorations (squiggles)
  - `codeLensProvider.ts` — Inline metrics display
  - `hoverProvider.ts` — Hover tooltips

### CLI Tool

- `src/cli/` — Headless CLI implementation:
  - `analyze.ts` — CLI entry point (argument parsing, orchestration)
  - `adapters/` — Node.js implementations of ports:
    - `nodeDocument.ts` — File discovery via glob
    - `nodeSymbol.ts` — TypeScript Compiler API for symbol extraction
    - `nodeCoverage.ts` — LCOV/JaCoCo file parsing
  - `formatters/` — Output formatters (JSON, GitHub Actions markdown)

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

- Call graph analysis may not be implemented for your language yet
- In CLI, simplified ranking (R=1) is the MVP default
- Check `NodeCallGraphProvider` implementation status

### "Tests are slow"

- Avoid network calls in unit tests
- Use test fixtures instead of real file I/O where possible
- Run specific test files during development: `npm test -- src/path/to/test.ts`

## Extension Points

To add support for a new language:

1. Implement `SymbolProvider` port (extract function/method symbols with line ranges)
2. Implement `CyclomaticComplexityProvider` port (CC per symbol)
3. Implement `CallGraphProvider` port (caller → callee edges)
4. Register language ID in `ccRegistry.ts`
5. Add BDD scenarios and tests

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
