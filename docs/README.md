# Documentation

This directory contains all documentation for the Dependable Dependencies (DDP) project, organized by purpose.

## Directory Structure

### 📐 [architecture/](./architecture/)

Architectural decisions, design principles, and system overview:

- **[ADR-001-cli-analysis-architecture.md](./architecture/ADR-001-cli-analysis-architecture.md)** — Architecture Decision Record for CLI/GitHub Actions implementation
- **[ARCHITECTURE_SUMMARY.md](./architecture/ARCHITECTURE_SUMMARY.md)** — High-level architecture with component diagrams and implementation phases
- **[DEPENDABLE_DEPENDENCIES_PLAN.md](./architecture/DEPENDABLE_DEPENDENCIES_PLAN.md)** — Original project plan with metrics specification and TDD workflow

### 📚 [guides/](./guides/)

Step-by-step implementation guides:

- **[IMPLEMENTATION_GUIDE_CLI.md](./guides/IMPLEMENTATION_GUIDE_CLI.md)** — Detailed CLI implementation guide with code examples and test-first approach
- **[QUICKSTART_CLI.md](./guides/QUICKSTART_CLI.md)** — Quick start for implementing CLI features in GitHub Actions

### 🛠️ [development/](./development/)

Development process, tasks, and specifications:

- **[TODO.md](./development/TODO.md)** — Current development tasks and roadmap
- **[BDD_SCENARIOS.md](./development/BDD_SCENARIOS.md)** — Behavior-Driven Development scenarios (living specification)
- **[features.md](./development/features.md)** — Feature file documentation with Gherkin scenarios

### 📋 [examples/](./examples/)

Configuration examples and schemas:

- **[README.md](./examples/README.md)** — Examples directory guide
- **[ddprc.example.json](./examples/ddprc.example.json)** — Example CLI configuration file
- **[ddprc.schema.json](./examples/ddprc.schema.json)** — JSON schema for .ddprc.json validation

### 🧪 [testing/](./testing/)

Testing strategies, coverage analysis, and quality assurance:

- **[MUTATION_TESTING.md](./testing/MUTATION_TESTING.md)** — Mutation testing guide using Stryker to validate test quality
- **[COVERAGE_INTEGRATION_ANALYSIS.md](./testing/COVERAGE_INTEGRATION_ANALYSIS.md)** — Deep dive into coverage data handling (LCOV, JaCoCo)

## Quick Navigation

### For New Contributors

1. Start with **[../README.md](../README.md)** for usage and setup
2. Read **[../claude.md](../claude.md)** for high-level intent and architecture overview
3. Review **[architecture/ADR-001-cli-analysis-architecture.md](./architecture/ADR-001-cli-analysis-architecture.md)** for design decisions
4. Follow **[guides/QUICKSTART_CLI.md](./guides/QUICKSTART_CLI.md)** to start implementing

### For Understanding Metrics

See **[../README.md](../README.md)** "Understanding the Metrics" section for:
- CC (Cyclomatic Complexity)
- T (Test Coverage)
- CRAP (Change Risk Anti-Pattern)
- R (Rank — call graph importance)
- F (Failure Risk)
- G (Churn Multiplier)
- F′ (Churn-Adjusted Failure Risk)

### For Implementing Features

1. Check **[development/BDD_SCENARIOS.md](./development/BDD_SCENARIOS.md)** for requirements
2. Follow **[guides/IMPLEMENTATION_GUIDE_CLI.md](./guides/IMPLEMENTATION_GUIDE_CLI.md)** for patterns
3. Use **[testing/MUTATION_TESTING.md](./testing/MUTATION_TESTING.md)** to validate quality

## Document Purpose Summary

| Document | Purpose | Audience |
|----------|---------|----------|
| ADR-001 | Architecture decision rationale | Developers, Architects |
| ARCHITECTURE_SUMMARY | System design and components | Developers, Contributors |
| DEPENDABLE_DEPENDENCIES_PLAN | Original requirements and plan | Product, Developers |
| IMPLEMENTATION_GUIDE_CLI | Detailed implementation steps | Developers |
| QUICKSTART_CLI | Fast-track implementation | Developers |
| TODO | Current work tracking | Developers |
| BDD_SCENARIOS | Living specification | QA, Developers |
| features.md | Feature file documentation | QA, Developers |
| ddprc.example.json | CLI configuration example | CLI Users, CI/CD |
| ddprc.schema.json | Configuration validation | CLI Users, Developers |
| MUTATION_TESTING | Test quality validation | QA, Developers |
| COVERAGE_INTEGRATION_ANALYSIS | Coverage system internals | Developers |

## Related Documentation

- **[../claude.md](../claude.md)** — AI context file with high-level intent and architecture patterns
- **[../README.md](../README.md)** — Main user documentation
- **[../features/](../features/)** — BDD feature files (Gherkin scenarios)
- **[../LICENSE](../LICENSE)** — Project license
