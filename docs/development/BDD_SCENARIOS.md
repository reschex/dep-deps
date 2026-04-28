# BDD Scenarios — Dependable Dependencies Risk Extension

**Status**: Migrated to Gherkin feature files (see [/features](../../features/))

This document previously contained informal BDD scenarios in markdown format. All scenarios have been converted to **proper Gherkin syntax** and organized into feature files for Acceptance Test-Driven Development (ATDD).

---

## Migration Map

| Original Feature | Feature File | Location |
|---|---|---|
| Rank computation | [rank-computation.feature](../../features/rank-computation.feature) | PageRank algorithm for dependency importance |
| CRAP and failure risk | [risk-metrics.feature](../../features/risk-metrics.feature) | F = R × CRAP calculations |
| Coverage mapping | [coverage-mapping.feature](../../features/coverage-mapping.feature) | Statement coverage → symbol mapping |
| JaCoCo XML coverage | [coverage-integration.feature](../../features/coverage-integration.feature) | Java coverage parsing |
| Sidebar risk list | [ui-risk-view.feature](../../features/ui-risk-view.feature) | Sidebar tree view and sorting |
| Editor decorations | [editor-decorations.feature](../../features/editor-decorations.feature) | Squiggle decorations for high-risk code |
| Inline breakdown | [editor-inline-metrics.feature](../../features/editor-inline-metrics.feature) | Code lens and hover tooltips |
| Missing data | [default-behavior.feature](../../features/default-behavior.feature) | Graceful degradation |
| Folder-scoped analysis | [folder-scoped-analysis.feature](../../features/folder-scoped-analysis.feature) | Analyze specific directories |
| Git churn weighting | [git-churn-weighting.feature](../../features/git-churn-weighting.feature) | Churn multiplier G for F' |

---

## Feature Files Reference

The `/features` directory contains the living specification for DDP in Gherkin format:

### Core Metrics
- **[risk-metrics.feature](../../features/risk-metrics.feature)** — CRAP, R, F calculations
- **[rank-computation.feature](../../features/rank-computation.feature)** — PageRank convergence
- **[coverage-mapping.feature](../../features/coverage-mapping.feature)** — Coverage → symbol mapping
- **[git-churn-weighting.feature](../../features/git-churn-weighting.feature)** — Churn multiplier G

### Data Integration
- **[coverage-integration.feature](../../features/coverage-integration.feature)** — LCOV and JaCoCo parsing
- **[symbol-extraction.feature](../../features/symbol-extraction.feature)** — Function/method discovery
- **[file-discovery.feature](../../features/file-discovery.feature)** — Workspace file traversal

### User Interface
- **[ui-risk-view.feature](../../features/ui-risk-view.feature)** — Sidebar tree view
- **[editor-decorations.feature](../../features/editor-decorations.feature)** — High-risk squiggles
- **[editor-inline-metrics.feature](../../features/editor-inline-metrics.feature)** — Code lens and hover

### CLI & CI/CD
- **[cli-command-interface.feature](../../features/cli-command-interface.feature)** — Headless analysis
- **[json-output.feature](../../features/json-output.feature)** — Machine-readable output
- **[github-summary.feature](../../features/github-summary.feature)** — GitHub Actions integration

### Workflows
- **[end-to-end-workflow.feature](../../features/end-to-end-workflow.feature)** — Full analysis pipeline
- **[folder-scoped-analysis.feature](../../features/folder-scoped-analysis.feature)** — Directory filtering
- **[error-handling.feature](../../features/error-handling.feature)** — Error recovery
- **[default-behavior.feature](../../features/default-behavior.feature)** — Graceful degradation

---

## Why Gherkin?

**Benefits of migration**:
1. **Executable specs** — Cucumber/SpecFlow can run these directly
2. **Stakeholder readability** — Non-technical users can read Given/When/Then
3. **Consistency** — Standardized format across all features
4. **Tooling** — IDE support for Gherkin syntax highlighting and navigation
5. **ATDD workflow** — Scenarios define behavior before implementation

**Usage**:
- QA engineers write new scenarios in feature files
- Software engineers implement step definitions
- Test suite validates scenarios automatically

**Given** churn weighting is enabled and analysis has completed
**When** the user selects "Sort by G" in the DDP risk sidebar
**Then** file nodes are ordered by their churn multiplier **G** descending, so the most frequently-changed files appear at the top regardless of their raw **F** score.
