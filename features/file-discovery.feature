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
