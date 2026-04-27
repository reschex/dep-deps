Feature: End-to-End Analysis Workflow
  As a developer
  I want complete analysis from source to output
  So that I get actionable risk metrics

  Scenario: Successful analysis with all features
    Given a TypeScript project with 10 source files
    And coverage data is available
    When I run "ddp-analyze --format github-summary --output report.md"
    Then all source files should be discovered
    And symbols should be extracted from each file
    And coverage should be loaded and mapped
    And risk metrics should be calculated
    And a markdown file "report.md" should be created
    And the file should contain a sortable table
    And the exit code should be 0

  Scenario: Analysis with missing coverage
    Given a TypeScript project with source files
    But no coverage data exists
    When I run "ddp-analyze"
    Then analysis should complete successfully
    And all symbols should have coverage = 0
    And CRAP scores should be calculated with T=0
    And a warning should be logged

  Scenario: Analysis with configuration file
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": 500,
        "excludeTests": true,
        "fileRollup": "max"
      }
      """
    When I run "ddp-analyze"
    Then configuration should be loaded from ".ddprc.json"
    And max 500 files should be analyzed
    And test files should be excluded

  Scenario: Graceful handling of empty project
    Given a project with no TypeScript files
    When I run "ddp-analyze"
    Then analysis should complete
    And a message should indicate no files were found
    And the exit code should be 0

  Scenario: Cancellation via signal
    Given analysis is running on a large project
    When I send SIGINT (Ctrl+C)
    Then analysis should stop gracefully
    And partial results should be discarded
    And the exit code should be non-zero

  Scenario: Performance within acceptable limits
    Given a project with 500 TypeScript files
    When I run "ddp-analyze"
    Then analysis should complete within 30 seconds
    And memory usage should remain under 500MB

  Scenario: Validation of output schema
    When I run "ddp-analyze --format json"
    Then the JSON output should conform to the schema
    And all required fields should be present
    And all field types should be correct
