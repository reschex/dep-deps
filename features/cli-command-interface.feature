Feature: DDP CLI Command Interface
  As a developer
  I want to run DDP analysis from the command line
  So that I can integrate risk analysis into CI/CD pipelines

  Background:
    Given a TypeScript project with source files
    And coverage data is available

  Scenario: Display help information
    When I run "ddp-analyze --help"
    Then I should see usage information
    And I should see all available options listed
    And I should see examples of usage

  Scenario: Display version information
    When I run "ddp-analyze --version"
    Then I should see the version number

  Scenario: Run analysis with default options
    Given I am in the project root directory
    When I run "ddp-analyze"
    Then the analysis should complete successfully
    And JSON output should be written to stdout
    And the exit code should be 0

  Scenario: Specify output file
    When I run "ddp-analyze --output analysis.json"
    Then the analysis should complete successfully
    And a file "analysis.json" should be created
    And the file should contain valid JSON

  Scenario: Specify custom root directory
    When I run "ddp-analyze --root /path/to/project"
    Then the analysis should scan files in "/path/to/project"
    And the analysis should complete successfully

  Scenario: Enable verbose logging
    When I run "ddp-analyze --verbose"
    Then I should see detailed logging output
    And the logs should include file discovery details
    And the logs should include symbol extraction progress

  Scenario: Invalid option provided
    When I run "ddp-analyze --invalid-option"
    Then I should see an error message about unknown option
    And the exit code should be non-zero
    And help information should be displayed

  Scenario: Multiple format specifications
    When I run "ddp-analyze --format json --format github-summary"
    Then I should see an error about conflicting options
    Or the last format should take precedence
