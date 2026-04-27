Feature: Error Handling and Validation
  As a developer
  I want clear error messages for invalid inputs
  So that I can quickly fix configuration issues

  Scenario: Invalid format specified
    When I run "ddp-analyze --format xml"
    Then I should see an error "Invalid format: xml"
    And valid formats should be listed
    And the exit code should be 1

  Scenario: Non-existent root directory
    When I run "ddp-analyze --root /nonexistent/path"
    Then I should see an error about invalid root directory
    And the exit code should be 1

  Scenario: Invalid configuration file
    Given a ".ddprc.json" with invalid JSON syntax
    When I run "ddp-analyze"
    Then I should see a JSON parse error
    And the line number should be indicated
    And the exit code should be 1

  Scenario: Permission denied on output file
    When I run "ddp-analyze --output /root/protected.json" as non-root
    Then I should see a permission denied error
    And the exit code should be 1

  Scenario: Malformed TypeScript file
    Given a TypeScript file with syntax errors
    When I run analysis
    Then the file should be skipped
    And a warning should be logged
    But analysis should continue for other files

  Scenario: Very large file handling
    Given a TypeScript file with 50,000 lines
    When I analyze the file
    Then analysis should complete without crashing
    And memory usage should remain reasonable

  Scenario: Unicode in file paths
    Given a file "src/файл.ts" (Cyrillic)
    When I run analysis
    Then the file should be analyzed correctly
    And the output should display the filename correctly

  Scenario: Disk full during output write
    Given disk space is exhausted
    When I run "ddp-analyze --output report.json"
    Then I should see a disk full error
    And a partial file should not be left behind
