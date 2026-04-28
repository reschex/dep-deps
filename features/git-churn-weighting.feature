Feature: Git Churn Weighting
  As a developer
  I want risk scores weighted by commit frequency
  So that actively-changing risky code is prioritized

  Background:
    Given a workspace under git version control

  Scenario: Frequently-changed files receive higher weighting
    Given churn weighting is enabled with 90-day lookback
    And file A has F = 50 and 20 commits in last 90 days
    And file B has F = 50 and 2 commits in last 90 days
    When churn factors are computed
    Then file A should have G > file B's G
    And file A's F' should be > file B's F'

  Scenario: Files with no recent commits use neutral multiplier
    Given a file was last modified 120 days ago
    And the lookback window is 90 days
    When the churn factor is computed
    Then G should be 1.0
    And F' should equal F

  Scenario: Churn formula applies logarithmic scaling
    Given a file with 10 commits in the lookback window
    When churn multiplier is calculated
    Then G should be 1 + ln(1 + 10)
    And G should be approximately 2.398

  Scenario: Configurable lookback window
    Given the user sets lookbackDays to 180
    When churn analysis runs
    Then only commits within last 180 days should count
    And commits older than 180 days should be ignored

  Scenario: Churn weighting can be disabled
    Given the user sets churn.enabled to false
    When analysis runs
    Then all files should have G = 1.0
    And F' should equal F for all symbols

  Scenario: Workspace without git degrades gracefully
    Given the workspace has no .git directory
    And churn weighting is enabled
    When analysis runs
    Then all files should have G = 1.0
    And a message should inform user git history not found
    And analysis should complete without errors

  Scenario: Churn factor visible in risk view
    Given churn weighting is enabled
    And analysis has completed
    When the user views a file in the DDP sidebar
    Then the file entry should display F' (churn-adjusted)
    And the entry should display raw F
    And the entry should display G (multiplier)

  Scenario: Sort by churn multiplier G
    Given churn weighting is enabled
    And analysis has completed
    When the user selects "Sort by G" in the sidebar
    Then files should be ordered by G descending
    And the most frequently-changed files should appear first

  Scenario: Churn applies at file level
    Given a file has 3 functions
    And the file has 15 commits in the lookback window
    When churn is computed
    Then all 3 functions should share the same G value
    And G should be based on file-level commit count

  Scenario: Zero commits results in base multiplier
    Given a file has 0 commits in the lookback window
    When churn multiplier is calculated
    Then G should be 1 + ln(1 + 0) = 1.0
