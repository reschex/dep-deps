Feature: Editor Inline Metrics (Code Lens and Hover)
  As a developer
  I want to see metrics inline in the editor
  So that I understand risk without navigating away

  Background:
    Given a file has been analyzed

  Scenario: Code lens displays metrics
    Given code lens is enabled
    When a function is displayed in the editor
    Then a code lens should appear above the function
    And it should show "CC: X, T: Y%, CRAP: Z, R: W, F: V"
    And all values should match the analysis results

  Scenario: Hover shows metric breakdown
    Given the cursor is on a function name
    When the user hovers over the function
    Then a tooltip should appear
    And it should show R (rank)
    And it should show CC (cyclomatic complexity)
    And it should show T (test coverage)
    And it should show CRAP score
    And it should show F (failure risk)
    And it should include an interpretation string

  Scenario: Hover shows churn metrics when enabled
    Given churn weighting is enabled
    And the cursor is on a function
    When the user hovers over the function
    Then the tooltip should also show G (churn multiplier)
    And it should show F' (churn-adjusted risk)

  Scenario: Code lens can be disabled
    Given code lens is disabled in settings
    When a function is displayed in the editor
    Then no code lens should appear above the function
    But hover tooltips should still work

  Scenario: Interpretation string explains risk level
    Given a function with high F and low T
    When the user hovers over it
    Then the interpretation should indicate "High risk: complex and untested"

  Scenario: Interpretation string for well-tested code
    Given a function with high CC but high T
    When the user hovers over it
    Then the interpretation should indicate "Complex but well-tested"

  Scenario: Interpretation string for widely-used code
    Given a function with high R
    When the user hovers over it
    Then the interpretation should indicate "Widely depended upon" or similar
