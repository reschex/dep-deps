Feature: Folder-Scoped Analysis
  As a developer
  I want to analyze only a specific folder
  So that I can focus on application code and avoid analyzing dependencies

  Background:
    Given a workspace with multiple folders

  Scenario: Analyze only the selected folder
    Given a workspace containing "src/", "tests/", and "node_modules/"
    When the user selects "src/" for analysis
    Then only files under "src/" should be analyzed
    And files in "tests/" should not be analyzed
    And files in "node_modules/" should not be analyzed

  Scenario: Folder scope limits symbol discovery
    Given the user selects folder "src/core" for analysis
    When symbol extraction runs
    Then only symbols in files under "src/core/" should be extracted
    And symbols in "src/utils/" should not be extracted

  Scenario: External dependencies as boundary nodes
    Given analysis is scoped to "src/app"
    And code in "src/app" imports from "node_modules/express"
    When the call graph is built
    Then "express" functions should appear as boundary dependencies
    But "express" internals should not be recursively analyzed

  Scenario: Exclude dependency folders by default
    Given a JavaScript workspace with "node_modules" present
    When the user runs folder-scoped analysis on "src/"
    Then "node_modules/" should not be descended into
    Unless the user explicitly selects "node_modules/" as the root

  Scenario: Scope affects coverage mapping
    Given analysis is scoped to "src/core"
    And coverage data exists for "src/core/helper.ts"
    And coverage data exists for "src/utils/other.ts"
    When coverage is mapped
    Then "src/core/helper.ts" should receive coverage
    But "src/utils/other.ts" should be ignored

  Scenario: Scope affects CC computation
    Given analysis is scoped to "src/app"
    When cyclomatic complexity is computed
    Then only files in "src/app" should be processed by ESLint/Radon/PMD
    And files outside scope should be skipped

  Scenario: UI reflects folder scope
    Given analysis was run on folder "src/core"
    When the user views the DDP sidebar
    Then the view should show "Scope: src/core"
    And only symbols from "src/core" should appear in the tree
