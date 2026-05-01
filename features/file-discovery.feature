Feature: Source File Discovery
  As a developer
  I want the CLI to discover source files intelligently
  So that only relevant files are analyzed

  Background:
    Given a project with the following structure:
      """
      src/
        utils.ts
        utils.test.ts
        main.ts
      tests/
        integration.test.ts
      node_modules/
        package/index.ts
      out/
        compiled.js
      .git/
        objects/
      """

  Scenario: Find TypeScript and JavaScript files
    When I run analysis on the project
    Then files matching "**/*.{ts,tsx,js,jsx}" should be discovered
    And "src/utils.ts" should be included
    And "src/main.ts" should be included

  Scenario: Exclude test files by default
    When I run "ddp-analyze --exclude-tests"
    Then "src/utils.ts" should be analyzed
    And "src/main.ts" should be analyzed
    But "src/utils.test.ts" should NOT be analyzed
    And "tests/integration.test.ts" should NOT be analyzed

  Scenario: Include test files when requested
    When I run "ddp-analyze --no-exclude-tests"
    Then "src/utils.test.ts" should be analyzed
    And "tests/integration.test.ts" should be analyzed

  Scenario: Exclude common build directories
    When I run analysis on the project
    Then files in "node_modules/" should NOT be analyzed
    And files in "out/" should NOT be analyzed
    And files in ".git/" should NOT be analyzed
    And files in "dist/" should NOT be analyzed

  Scenario: Respect max files limit
    Given a project with 150 source files
    When I run "ddp-analyze --max-files 100"
    Then exactly 100 files should be analyzed
    And a warning should be logged about truncation

  Scenario: Analyze specific folder scope
    When I run "ddp-analyze --root src/services"
    Then only files under "src/services" should be analyzed
    And files outside "src/services" should be ignored

  Scenario: Respect .gitignore patterns when configured
    Given the project has a .gitignore file containing:
      """
      generated/
      *.generated.ts
      """
    And "ddp.fileFilter.respectGitignore" is set to true
    When I run analysis on the project
    Then files in "generated/" should NOT be analyzed
    And files matching "*.generated.ts" should NOT be analyzed
    But "src/utils.ts" should still be analyzed

  Scenario: Do not filter by .gitignore when setting is disabled
    Given the project has a .gitignore file containing:
      """
      generated/
      """
    And "ddp.fileFilter.respectGitignore" is set to false (default)
    When I run analysis on the project
    Then files in "generated/" should be analyzed normally

  Scenario: Missing .gitignore handled gracefully
    Given the project does not have a .gitignore file
    And "ddp.fileFilter.respectGitignore" is set to true
    When I run analysis on the project
    Then the analysis should complete successfully
    And no files should be excluded by gitignore filtering

  Scenario: Debug logging shows discovered files
    Given "ddp.debug" is set to true
    When I run analysis on the project
    Then the logger should emit a debug message listing each discovered file URI
    And the logger should emit the total file count before symbol extraction begins
    And the logger should emit per-file symbol counts

  Scenario: No debug logging when disabled
    Given "ddp.debug" is set to false (default)
    When I run analysis on the project
    Then the logger should NOT emit any debug messages
