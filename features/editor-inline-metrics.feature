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

  Scenario: Interpretation for high CC and low coverage
    Given a function with CC=15 and T=10%
    When the user hovers over it
    Then the interpretation should explain "High CC, low coverage → high CRAP"
    And suggest writing tests to reduce CRAP

  Scenario: Interpretation for well-tested complex code
    Given a function with CC=12 and T=95%
    When the user hovers over it
    Then the interpretation should explain that high coverage mitigates complexity
    And the tone should be reassuring, not alarming

  Scenario: Interpretation for widely-depended-upon risky code
    Given a function with R=8.5 and CRAP=120
    When the user hovers over it
    Then the interpretation should explain that failures cascade through dependents
    And suggest decoupling or adding tests to reduce blast radius

  Scenario: Interpretation for frequently-changing risky code
    Given a function with F=200 and G=3.2 (many recent commits)
    When the user hovers over it
    Then the interpretation should explain that frequent changes amplify risk
    And flag this as the most urgent priority

  Scenario: Interpretation for low-risk code
    Given a function with CC=2, T=90%, R=1.0
    When the user hovers over it
    Then the interpretation should be minimal or absent
    # the symbol poses little risk so no actionable insight is shown
