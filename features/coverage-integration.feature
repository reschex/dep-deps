Feature: Coverage Data Integration
  As a developer
  I want coverage data to be integrated into risk metrics
  So that untested code is properly identified

  Background:
    Given analysis is configured to use coverage data

  Scenario: Load LCOV coverage file
    Given a project with "coverage/lcov.info" containing:
      """
      SF:src/utils.ts
      FN:10,processData
      FNDA:5,processData
      FNF:1
      FNH:1
      DA:10,1
      DA:11,5
      DA:12,3
      LH:3
      LF:3
      end_of_record
      """
    When I run "ddp-analyze --lcov-glob '**/coverage/lcov.info'"
    Then coverage data should be loaded for "src/utils.ts"
    And function "processData" should have coverage > 0

  Scenario: Handle missing coverage file gracefully
    Given no coverage files exist
    When I run "ddp-analyze --lcov-glob '**/coverage/lcov.info'"
    Then the analysis should complete successfully
    And all symbols should have coverage = 0
    And a warning should be logged about missing coverage

  Scenario: Load JaCoCo coverage (Java)
    Given a project with "target/site/jacoco/jacoco.xml"
    When I run "ddp-analyze --jacoco-glob '**/jacoco/jacoco.xml'"
    Then coverage data should be loaded from JaCoCo
    And Java file coverage should be available

  Scenario: Match coverage to symbols by line range
    Given a function at lines 10-15
    And coverage data shows lines 10-12 are covered
    When I calculate coverage for the function
    Then the function coverage should be 50%

  Scenario: Zero coverage for uncovered functions
    Given a function at lines 20-25
    And coverage data has no hits for lines 20-25
    When I calculate coverage for the function
    Then the function coverage should be 0%

  Scenario: Full coverage for fully tested functions
    Given a function at lines 30-35
    And coverage data shows all lines 30-35 are covered
    When I calculate coverage for the function
    Then the function coverage should be 100%
