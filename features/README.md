# Feature Files — Gherkin Specifications

This directory contains **Acceptance Test-Driven Development (ATDD)** specifications written in Gherkin format. Each feature file describes expected behavior using Given/When/Then scenarios.

---

## Feature File Index

### Core Risk Metrics
- **[risk-metrics.feature](./risk-metrics.feature)** — CRAP score, failure risk (F), and R × CRAP calculations
- **[rank-computation.feature](./rank-computation.feature)** — PageRank algorithm for call graph importance (R)
- **[coverage-mapping.feature](./coverage-mapping.feature)** — Statement coverage mapping to function symbols (T)
- **[git-churn-weighting.feature](./git-churn-weighting.feature)** — Churn multiplier (G) and churn-adjusted risk (F')

### Data Integration
- **[coverage-integration.feature](./coverage-integration.feature)** — LCOV and JaCoCo coverage file parsing
- **[symbol-extraction.feature](./symbol-extraction.feature)** — Function/method discovery across TypeScript, JavaScript, Python, Java
- **[file-discovery.feature](./file-discovery.feature)** — Workspace file traversal and filtering

### User Interface
- **[ui-risk-view.feature](./ui-risk-view.feature)** — Sidebar tree view, sorting, and navigation
- **[editor-decorations.feature](./editor-decorations.feature)** — High-risk squiggle decorations in editor
- **[editor-inline-metrics.feature](./editor-inline-metrics.feature)** — Code lens and hover tooltips

### CLI & CI/CD
- **[cli-command-interface.feature](./cli-command-interface.feature)** — Headless analysis for automation
- **[json-output.feature](./json-output.feature)** — Machine-readable structured output
- **[github-summary.feature](./github-summary.feature)** — GitHub Actions markdown reports

### Workflows & Edge Cases
- **[end-to-end-workflow.feature](./end-to-end-workflow.feature)** — Complete analysis pipeline from files to results
- **[folder-scoped-analysis.feature](./folder-scoped-analysis.feature)** — Analyze specific directories, exclude dependencies
- **[error-handling.feature](./error-handling.feature)** — Error recovery and validation
- **[default-behavior.feature](./default-behavior.feature)** — Graceful degradation with missing data (coverage, CC tools)

---

## Gherkin Format

All feature files follow this structure:

```gherkin
Feature: <Title>
  As a <role>
  I want <goal>
  So that <benefit>

  Background:
    Given <common precondition>

  Scenario: <Description>
    Given <precondition>
    And <additional context>
    When <action>
    Then <expected outcome>
    And <additional verification>
```

**Comments** document formulas or implementation notes:
```gherkin
Then CRAP should be 13.744
# CRAP = CC² × (1 - T)³ + CC
# CRAP = 4² × (1 - 0.3)³ + 4 = 16 × 0.343 + 4 = 13.744
```

---

## Usage

### For QA Engineers
1. **Define behavior** — Write new scenarios in feature files before implementation
2. **Review coverage** — Ensure all edge cases have scenarios
3. **Update specs** — Keep scenarios synchronized with product changes

### For Software Engineers
1. **Implement step definitions** — Map Given/When/Then to test code
2. **TDD workflow** — RED (write failing scenario) → GREEN (implement) → REFACTOR
3. **Verify behavior** — Run automated tests against scenarios

### For Stakeholders
- **Read scenarios** to understand what the system does
- **Propose new scenarios** for missing features or edge cases
- **Validate acceptance criteria** before release

---

## Test Implementation Status

| Feature File | Implementation | Step Definitions |
|---|---|---|
| risk-metrics.feature | ✅ Complete | `src/core/metrics.test.ts` |
| rank-computation.feature | ✅ Complete | `src/core/rank.test.ts` |
| coverage-mapping.feature | ✅ Complete | `src/core/coverageMap.test.ts` |
| coverage-integration.feature | ✅ Complete | `src/core/lcovParse.test.ts`, `src/core/jacocoParse.test.ts` |
| symbol-extraction.feature | ✅ Complete | `src/cli/adapters/nodeSymbol.test.ts` |
| file-discovery.feature | ✅ Complete | `src/cli/adapters/nodeDocument.test.ts` |
| cli-command-interface.feature | ✅ Complete | `src/cli/analyze.test.ts` |
| json-output.feature | ✅ Complete | `src/cli/formatters/json.test.ts` |
| github-summary.feature | ✅ Complete | `src/cli/formatters/github.test.ts` |
| end-to-end-workflow.feature | ✅ Complete | `src/core/analyze.test.ts` |
| error-handling.feature | ✅ Complete | Various test files |
| git-churn-weighting.feature | 🔄 Partial | `src/core/churn.test.ts`, `src/core/churnParse.test.ts` |
| ui-risk-view.feature | 🔄 Partial | `src/ddp/riskTreeProvider.test.ts` |
| editor-decorations.feature | 🔄 Partial | `src/ddp/decorationManager.test.ts` |
| editor-inline-metrics.feature | 🔄 Partial | `src/ddp/codeLensProvider.test.ts`, `src/ddp/hoverProvider.test.ts` |
| folder-scoped-analysis.feature | ❌ Not Implemented | Planned |
| default-behavior.feature | ✅ Complete | Configuration and fallback tests |

---

## Adding New Features

1. **Create feature file**: `features/<name>.feature`
2. **Write scenarios**: Follow Gherkin format with Given/When/Then
3. **Implement tests**: Create corresponding `.test.ts` file(s)
4. **Validate**: Ensure scenarios pass with test suite
5. **Update this README**: Add feature to index and status table

---

## References

- [Gherkin Syntax](https://cucumber.io/docs/gherkin/reference/)
- [BDD Best Practices](https://cucumber.io/docs/bdd/)
- [Original BDD Scenarios](../docs/development/BDD_SCENARIOS.md) — Migration source
