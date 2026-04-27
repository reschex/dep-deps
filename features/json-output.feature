Feature: JSON Output Format
  As a CI/CD pipeline
  I want structured JSON output
  So that I can parse and process risk data programmatically

  Scenario: Generate valid JSON structure
    Given analysis has completed
    When I format output as JSON
    Then the output should be valid JSON
    And the output should have a "timestamp" field
    And the output should have a "summary" object
    And the output should have a "files" array

  Scenario: Include summary statistics
    Given 45 files analyzed
    And 423 symbols found
    And average CC is 3.2
    When I format output as JSON
    Then summary.filesAnalyzed should be 45
    And summary.symbolsAnalyzed should be 423
    And summary.averageCC should be 3.2

  Scenario: Include file-level data
    Given a file "src/utils.ts" with rollup score 12.5
    When I format output as JSON
    Then the files array should contain an entry for "src/utils.ts"
    And the entry should have "uri" field
    And the entry should have "path" field with value "src/utils.ts"
    And the entry should have "rollupScore" of 12.5

  Scenario: Include symbol-level data
    Given a function "processData" at line 10
    And the function has CC=8, coverage=0.5, CRAP=10.5
    When I format output as JSON
    Then the symbol should be in the output
    And the symbol should have "name" = "processData"
    And the symbol should have "line" = 10
    And the symbol should have "cc" = 8
    And the symbol should have "t" = 0.5
    And the symbol should have "crap" = 10.5

  Scenario: Convert absolute URIs to relative paths
    Given a file with URI "file:///workspace/src/utils.ts"
    And workspace root is "/workspace"
    When I format output as JSON
    Then the "path" field should be "src/utils.ts"

  Scenario: Write JSON to stdout by default
    When I run "ddp-analyze --format json"
    Then JSON output should be written to stdout
    And no file should be created

  Scenario: Write JSON to specified file
    When I run "ddp-analyze --format json --output results.json"
    Then a file "results.json" should be created
    And the file should contain valid JSON
