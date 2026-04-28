Feature: Coverage Mapping to Symbols
  As a QA engineer
  I want statement coverage correctly mapped to function symbols
  So that test coverage metric (T) reflects actual code coverage

  Background:
    Given a project with coverage data

  Scenario: Full coverage for a function
    Given a function spanning lines 10-15
    And all lines 10-15 are marked as covered
    When coverage is mapped to the function
    Then the function's coverage T should be 1.0

  Scenario: Partial coverage for a function
    Given a function spanning lines 20-30
    And lines 20-24 are covered
    And lines 25-30 are not covered
    When coverage is mapped to the function
    Then the function's coverage T should be approximately 0.45
    # 5 covered out of 11 total lines

  Scenario: Zero coverage for a function
    Given a function spanning lines 40-45
    And no lines in range 40-45 are covered
    When coverage is mapped to the function
    Then the function's coverage T should be 0.0

  Scenario: Multi-line statement coverage
    Given a function with statements spanning multiple lines
    And a statement covering lines 50-52 is executed
    When coverage is mapped to the function
    Then all lines 50-52 should count as covered

  Scenario: No coverage data available
    Given a function in a file with no coverage data
    When coverage is mapped to the function
    Then the function's coverage T should use fallback value
    # Default: 0.0 (worst-case) or configured fallback

  Scenario: Coverage maps to correct file URI
    Given coverage data for "src/utils/helper.ts"
    And a function exists in "src/utils/helper.ts"
    When coverage is mapped
    Then the function should receive coverage from matching URI
    And functions in other files should not receive this coverage
