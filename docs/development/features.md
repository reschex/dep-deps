# DDP CLI BDD Feature Files

This directory contains Behavior-Driven Development (BDD) feature files that specify the expected behavior of the DDP CLI tool for GitHub Actions integration.

## Overview

These feature files serve multiple purposes:

1. **Requirements Specification:** Human-readable documentation of what the CLI should do
2. **Test Scenarios:** Concrete examples that can be automated as integration tests
3. **TDD Driver:** Scenarios guide Red-Green-Refactor implementation workflow
4. **Living Documentation:** Features stay in sync with implementation

## Feature Files

### Core CLI Functionality

- **[cli-command-interface.feature](./cli-command-interface.feature)**
  - Command-line argument parsing
  - Help and version display
  - Output file handling
  - Verbose logging

- **[file-discovery.feature](./file-discovery.feature)**
  - Source file pattern matching
  - Test file exclusion
  - Directory filtering (node_modules, out, etc.)
  - Max files limit enforcement

- **[symbol-extraction.feature](./symbol-extraction.feature)**
  - TypeScript/JavaScript function detection
  - Method extraction from classes
  - Arrow function handling
  - Line range accuracy

### Analysis and Metrics

- **[coverage-integration.feature](./coverage-integration.feature)**
  - LCOV file parsing
  - JaCoCo XML parsing
  - Coverage-to-symbol mapping
  - Missing coverage handling

- **[risk-metrics.feature](./risk-metrics.feature)**
  - CRAP score calculation
  - Failure risk (F = R × CRAP)
  - File-level rollup strategies
  - Edge cases (zero/full coverage)

### Output Formatting

- **[json-output.feature](./json-output.feature)**
  - JSON schema validation
  - Summary statistics
  - URI-to-path conversion
  - Stdout vs file output

- **[github-summary.feature](./github-summary.feature)**
  - Markdown generation
  - Sortable HTML tables
  - Color-coded risk levels
  - JavaScript sorting functionality

### Integration and Error Handling

- **[end-to-end-workflow.feature](./end-to-end-workflow.feature)**
  - Complete analysis workflows
  - Configuration file loading
  - Performance requirements
  - Signal handling (Ctrl+C)

- **[error-handling.feature](./error-handling.feature)**
  - Invalid inputs
  - Missing files/directories
  - Permission errors
  - Edge cases (large files, unicode paths)

### AI Agent Integration

- **[ai-agent-integration.feature](./ai-agent-integration.feature)**
  - PreToolUse hook warn/block behaviour (F thresholds)
  - Hook skip logic (non-source files, test files, custom patterns)
  - Threshold configuration via `.ddprc.json`
  - CLI caller-tree text format (LLM-optimised output)
  - CLI caller-tree JSON format (MCP-ready structured output)
  - Risk level labels: LOW / MEDIUM / HIGH / CRITICAL
  - MCP server tool contracts and return schemas
  - Agent workflow: query → assess → acknowledge → act

## Implementation Workflow

### 1. Read Feature Scenarios

Before implementing a component, read the relevant feature file to understand expected behavior.

Example:
```bash
# Before implementing NodeDocumentProvider
cat features/file-discovery.feature
```

### 2. Write Failing Tests (RED)

Translate scenarios into automated tests:

```typescript
// src/cli/adapters/nodeDocument.test.ts
import { describe, it, expect } from 'vitest';
import { NodeDocumentProvider } from './nodeDocument';

describe('NodeDocumentProvider - file-discovery.feature', () => {
  it('should find TypeScript and JavaScript files', async () => {
    // Scenario: Find TypeScript and JavaScript files
    const provider = new NodeDocumentProvider(TEST_FIXTURE_PATH);
    const files = await provider.findSourceFiles(100);
    
    expect(files).toContain('src/utils.ts');
    expect(files).toContain('src/main.ts');
    expect(files.some(f => f.endsWith('.ts') || f.endsWith('.js'))).toBe(true);
  });

  it('should exclude test files by default', async () => {
    // Scenario: Exclude test files by default
    const provider = new NodeDocumentProvider(TEST_FIXTURE_PATH, true);
    const files = await provider.findSourceFiles(100);
    
    expect(files).toContain('src/utils.ts');
    expect(files).not.toContain('src/utils.test.ts');
    expect(files).not.toContain('tests/integration.test.ts');
  });
});
```

### 3. Implement to Pass (GREEN)

Write minimal code to make tests pass:

```typescript
// src/cli/adapters/nodeDocument.ts
import { glob } from 'glob';

export class NodeDocumentProvider implements DocumentProvider {
  async findSourceFiles(maxFiles: number): Promise<string[]> {
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      ignore: ['**/node_modules/**', '**/out/**', '**/*.test.ts'],
      absolute: true,
    });
    return files.slice(0, maxFiles);
  }
}
```

### 4. Refactor (REFACTOR)

Clean up code while keeping tests green.

### 5. Repeat

Move to the next scenario and repeat Red-Green-Refactor.

## Test Fixtures

Create test fixtures to support scenario automation:

```
tests/fixtures/cli/
  simple-project/
    src/
      utils.ts
      main.ts
    package.json
  
  with-coverage/
    src/
      app.ts
    coverage/
      lcov.info
    package.json
  
  with-tests/
    src/
      logic.ts
      logic.test.ts
    tests/
      integration.test.ts
  
  large-project/
    # 500+ files for performance testing
  
  malformed/
    src/
      syntax-error.ts  # Invalid TypeScript
  
  unicode-paths/
    src/
      файл.ts  # Cyrillic filename
```

## Running Feature Tests

### Manual Verification

```bash
# Test a specific scenario manually
npm run compile
npm run cli -- --help  # Should show usage info

# Scenario: Display help information ✓
```

### Automated Test Suite

```bash
# Run all CLI integration tests
npm run test:cli

# Run specific feature tests
npm run test -- file-discovery
```

### CI Integration

Feature tests run automatically in GitHub Actions:

```yaml
- name: Test CLI Features
  run: npm run test:cli
```

## Gherkin Syntax Reference

### Keywords

- **Feature:** High-level description of functionality
- **Scenario:** Specific example of behavior
- **Given:** Precondition/context
- **When:** Action/event
- **Then:** Expected outcome
- **And/But:** Additional conditions or outcomes
- **Background:** Common preconditions for all scenarios in a feature

### Example

```gherkin
Feature: User Login
  As a user
  I want to log in securely
  So that I can access my account

  Scenario: Successful login
    Given I am on the login page
    And I have valid credentials
    When I enter my username and password
    And I click the "Login" button
    Then I should be redirected to the dashboard
    And I should see a welcome message
```

## Coverage Tracking

Track which scenarios have automated tests:

```bash
# Generate coverage report showing scenario coverage
npm run test:scenarios:coverage
```

Target: **100% scenario coverage** before declaring feature "done."

## Contributing

When adding new CLI features:

1. **Write feature file first** (BDD scenarios)
2. **Review with team** (scenarios are the spec)
3. **Implement with TDD** (Red-Green-Refactor)
4. **Update this README** if adding new feature files

## Related Documentation

- **[QUICKSTART_CLI.md](../guides/QUICKSTART_CLI.md)** - Implementation quick start guide
- **[IMPLEMENTATION_GUIDE_CLI.md](../guides/IMPLEMENTATION_GUIDE_CLI.md)** - Detailed technical specs
- **[AI_AGENT_INTEGRATION_GUIDE.md](../guides/AI_AGENT_INTEGRATION_GUIDE.md)** - PreToolUse hook and MCP server implementation
- **[ADR-001](../architecture/ADR-001-cli-analysis-architecture.md)** - CLI/CI architectural decisions
- **[ADR-004](../architecture/ADR-004-ai-agent-integration.md)** - AI agent integration architectural decisions
- **[ARCHITECTURE_SUMMARY.md](../architecture/ARCHITECTURE_SUMMARY.md)** - Overall architecture

## Questions?

- Check scenario comments for clarification
- See implementation guide for technical details
- Open discussion for ambiguous scenarios

---

**Remember:** Features drive development. Implement what's specified, then refactor. Don't add unspecified behavior without adding scenarios first!
