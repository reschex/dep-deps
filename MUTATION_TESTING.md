# Mutation Testing with Stryker

This project uses **Stryker** for mutation testing to assess the quality and effectiveness of the test suite. Mutation testing helps identify weak tests by introducing small changes (mutations) to the source code and checking if the tests catch them.

## Overview

Mutation testing measures how well your tests detect bugs. It works by:

1. **Creating mutants**: Small modifications to source code (e.g., `>` becomes `>=`, `true` becomes `false`)
2. **Running tests**: Executing the test suite against each mutant
3. **Scoring**: 
   - **Killed mutant**: Tests failed (good — tests caught the bug)
   - **Survived mutant**: Tests passed (bad — tests didn't catch the mutation)
   - **Mutation Score**: `(killed / total) × 100`

## Quick Start

### Install Dependencies

Dependencies are already installed. Verify with:

```bash
npm list @stryker-mutator/core @stryker-mutator/vitest-runner
```

### Run Mutation Tests

```bash
npm run mutation
```

This runs a full mutation test suite and generates reports in `reports/mutation/`.

**Output:**
- **Console output**: Summary table showing files, mutation scores, and survival stats
- **HTML report**: `reports/mutation/mutation.html` (open in browser for detailed interactive analysis)
- **JSON report**: `reports/mutation/mutation.json` (for CI/CD integration)

### Incremental Mutation Testing

For faster iteration during development, run only mutants that changed since the last run:

```bash
npm run mutation:incremental
```

This uses incremental analysis to skip unchanged code, significantly reducing test time.

## Understanding the Report

### Mutation Score Interpretation

| Score | Assessment |
|-------|-----------|
| **>80%** | Excellent — test suite is highly effective |
| **60–80%** | Good — solid test coverage, but some edge cases may be missed |
| **40–60%** | Moderate — tests miss significant mutations; consider improving coverage |
| **<40%** | Weak — tests fail to detect many potential bugs |

### Report Columns

- **% Mutation score (total)**: Overall mutation score for the file
- **% covered**: Percentage of code with test coverage
- **# killed**: Number of mutants caught by tests (good)
- **# timeout**: Mutants that caused infinite loops or hangs
- **# survived**: Mutants that tests didn't catch (bad—indicates weak tests)
- **# no cov**: Mutants in uncovered code (naturally not killed)
- **# errors**: Internal errors during mutation

### Example HTML Report

The interactive HTML report allows you to:
- Click on file names to drill down
- View specific mutations and whether tests killed them
- Identify lines with surviving mutants to improve tests

## Configuration

Configuration is in `stryker.conf.mjs`:

```javascript
{
  testRunner: 'vitest',              // Use Vitest as test runner
  mutate: [...],                     // Files to mutate (source code)
  testFiles: [...],                  // Test files to run
  ignorePatterns: [...],             // Files/dirs to exclude
  thresholds: {
    break: 60,                       // Fail CI if score drops below 60%
    high: 80,                        // Consider score
    low: 40,
  },
  concurrency: 4,                    // Run 4 mutations in parallel
  timeoutMS: 30000,                  // Timeout per test run
  reporters: ['html', 'json', 'clear-text'],
}
```

### Adjusting Mutants

To target specific files or exclude certain mutation types, edit `stryker.conf.mjs`:

- **Mutate specific files**:
  ```javascript
  mutate: ['src/core/**/*.ts', '!src/**/*.test.ts'],
  ```

- **Exclude modules**:
  ```javascript
  ignorePatterns: ['src/test/**', '**/*.d.ts'],
  ```

- **Adjust timeouts** for slow test suites:
  ```javascript
  timeoutMS: 60000,  // Increase to 60 seconds
  ```

- **Reduce mutation score threshold** for progressive improvement:
  ```javascript
  thresholds: { break: 50 },
  ```

## Improving Your Mutation Score

### Steps to Improve Tests

1. **Run mutation tests**: `npm run mutation`
2. **Review HTML report** (`reports/mutation/mutation.html`)
3. **Find surviving mutants**: Look for files/lines with high survival rates
4. **Add edge case tests**: Write tests that would catch those mutations
5. **Re-run**: `npm run mutation:incremental` to verify improvement

### Common Issues

#### Many Uncovered Mutants (`# no cov`)

The code isn't covered by tests. Add test coverage first:

```bash
npm run test:coverage
```

Then examine the coverage report to see which functions lack tests.

#### High Timeout Rate (`# timeout`)

Mutations caused infinite loops. This may indicate:
- Complex recursion without proper exit conditions
- External API calls that need mocking
- Infinite loops in configuration or initialization

**Fix**: Mock external dependencies or add more targeted tests.

#### Surviving Mutants Are Hard to Catch

The mutation might be in subtle logic. Consider:
- Adding property-based tests (using `fast-check` or similar)
- Testing edge cases and boundary conditions
- Adding assertions that validate behavior, not just return values

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run mutation tests
  run: npm run mutation
  
- name: Check mutation score
  run: |
    SCORE=$(cat reports/mutation/mutation.json | jq '.score')
    if (( $(echo "$SCORE < 60" | bc -l) )); then
      echo "Mutation score $SCORE below threshold (60%)"
      exit 1
    fi
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit` to run incremental tests before committing:

```bash
#!/bin/sh
npm run mutation:incremental || exit 1
```

## Troubleshooting

### Tests Not Found

Ensure `testFiles` in `stryker.conf.mjs` matches your test file pattern:

```javascript
testFiles: ['src/**/*.test.ts'],  // Matches src/core/analyze.test.ts, etc.
```

### Slow Test Runs

1. **Reduce concurrency** for resource-constrained environments:
   ```javascript
   concurrency: 2,
   ```

2. **Use incremental mode** for faster iteration:
   ```bash
   npm run mutation:incremental
   ```

3. **Exclude slow files**:
   ```javascript
   mutate: ['src/**/*.ts', '!src/**/*.integration.ts'],
   ```

### Out of Memory

Increase Node.js heap size:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run mutation
```

## Further Reading

- [Stryker Documentation](https://stryker-mutator.io/)
- [Mutation Testing Best Practices](https://stryker-mutator.io/docs/general/mutation-testing/)
- [Stryker Vitest Integration](https://stryker-mutator.io/docs/stryker-js/guides/vitest/)
- [Dependable Dependencies Principle](https://codemanship.co.uk/Dependable%20Dependencies.pdf)

## Related Scripts

```bash
npm run test              # Run unit tests (Vitest)
npm run test:coverage    # Run tests with coverage report
npm run test:watch      # Watch mode for development
npm run mutation         # Full mutation test run
npm run mutation:incremental  # Incremental mutation testing
```
