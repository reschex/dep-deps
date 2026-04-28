Feature: Default Behavior and Missing Data
  As a developer
  I want analysis to handle missing data gracefully
  So that I can still get useful results even with incomplete coverage

  Background:
    Given a project with source code

  Scenario: No coverage data defaults to worst-case
    Given no coverage files are found
    And fallback T is set to 0
    When analysis runs
    Then all functions should have T = 0.0
    And CRAP should reflect no coverage (worst-case)
    And the UI should indicate "Coverage not loaded"

  Scenario: Fallback coverage can be configured
    Given no coverage files are found
    And the user sets fallbackT to 100 (full coverage assumption)
    When analysis runs
    Then all functions should have T = 1.0
    And CRAP should reflect full coverage

  Scenario: Missing CC tool falls back to estimation
    Given ESLint is not found in PATH
    And useEslintForTsJs is true
    When cyclomatic complexity is needed
    Then the extension should fall back to regex-based estimation
    And a warning should be logged about fallback usage

  Scenario: File with no symbols is skipped
    Given a TypeScript file with only type definitions
    When symbol extraction runs
    Then the file should return 0 symbols
    And the file should not appear in risk results

  Scenario: Symbol with no coverage data
    Given a function in "src/new-file.ts"
    And coverage data exists for "src/old-file.ts" only
    When coverage is mapped
    Then the function should receive fallback T value
    And it should not receive coverage from other files

  Scenario: Call graph with no edges
    Given a set of functions with no calls between them
    When rank computation runs
    Then all functions should have R = 1.0
    And F should equal CRAP for all functions

  Scenario: Workspace with no test coverage tool
    Given the workspace has no Jest, Vitest, or coverage configuration
    When the user runs analysis
    Then analysis should complete
    And all T values should use fallback
    And a message should inform user how to enable coverage

  Scenario: Partially available coverage
    Given coverage data for "src/app/" exists
    And no coverage data for "src/utils/" exists
    When analysis runs
    Then functions in "src/app/" should use actual coverage
    And functions in "src/utils/" should use fallback T
