Feature: Risk Metrics Calculation
  As a QA engineer
  I want accurate risk metrics calculated for each symbol
  So that I can prioritize testing and refactoring

  Background:
    Given a project with analyzed symbols

  Scenario: Calculate CRAP score for function
    Given a function with CC = 8
    And the function has coverage = 0.5
    When I calculate CRAP score
    Then CRAP should be approximately 10.5
    # CRAP = CC² × (1 - T)³ + CC = 64 × 0.125 + 8 = 10

  Scenario: Calculate failure risk with simplified ranking (R=1)
    Given a function with CC = 10
    And the function has coverage = 0.3
    And all symbols have rank R = 1
    When I calculate failure risk F
    Then F should equal CRAP
    # F = R × CRAP, with R=1, F = CRAP

  Scenario: Handle zero coverage
    Given a function with CC = 5
    And the function has coverage = 0.0
    When I calculate CRAP score
    Then CRAP should be 30
    # CRAP = 25 × 1 + 5 = 30

  Scenario: Handle perfect coverage
    Given a function with CC = 5
    And the function has coverage = 1.0
    When I calculate CRAP score
    Then CRAP should be 5
    # CRAP = 25 × 0 + 5 = 5

  Scenario: Calculate file-level rollup (max strategy)
    Given a file with symbols having F' = [10, 25, 5, 15]
    When I calculate file rollup using "max" strategy
    Then the file risk score should be 25

  Scenario: Calculate file-level rollup (sum strategy)
    Given a file with symbols having F' = [10, 25, 5, 15]
    When I calculate file rollup using "sum" strategy
    Then the file risk score should be 55

  Scenario: Calculate file-level rollup (avg strategy)
    Given a file with symbols having F' = [10, 20, 30, 40]
    When I calculate file rollup using "avg" strategy
    Then the file risk score should be 25
