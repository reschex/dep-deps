Feature: Editor Decorations
  As a developer
  I want visual indicators of risky code in the editor
  So that I can see high-risk functions without opening the sidebar

  Background:
    Given a file has been analyzed
    And decoration thresholds are configured

  Scenario: High-risk decoration (red squiggle)
    Given a function with F = 200
    And the error threshold is 150
    When the file is opened in the editor
    Then the function should have a red squiggle decoration
    And hovering should show "High risk" or similar message

  Scenario: Medium-risk decoration (yellow squiggle)
    Given a function with F = 80
    And the warning threshold is 50
    And the error threshold is 150
    When the file is opened in the editor
    Then the function should have a yellow squiggle decoration
    And hovering should show "Moderate risk" or similar message

  Scenario: Low-risk has no decoration
    Given a function with F = 20
    And the warning threshold is 50
    When the file is opened in the editor
    Then the function should have no squiggle decoration

  Scenario: Configurable thresholds
    Given the user sets warning threshold to 100
    And the user sets error threshold to 300
    When a function with F = 150 is displayed
    Then it should have a yellow squiggle (warning)
    And it should not have a red squiggle

  Scenario: File-level decoration
    Given a file with max(F) = 250
    And the error threshold is 150
    When the file is displayed in the explorer
    Then the file should be decorated as high-risk

  Scenario: Decorations update after re-analysis
    Given a file has decorations for F = 150
    When tests are added and coverage increases to T = 0.9
    And the user re-runs analysis
    Then decorations should update to reflect new F value
    And decoration color should change if thresholds crossed
