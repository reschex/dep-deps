Feature: UI Risk View (Sidebar)
  As a developer
  I want to view risky functions in a sidebar
  So that I can quickly identify code needing attention

  Background:
    Given a workspace has been analyzed

  Scenario: Sort by failure risk (F)
    Given the DDP sidebar is open
    When the user selects "Sort by F"
    Then symbols should be ordered by F descending
    And the highest-F symbols should appear first
    And each entry should show the file path

  Scenario: Sort by churn-adjusted risk (F')
    Given churn weighting is enabled
    And the DDP sidebar is open
    When the user selects "Sort by F'"
    Then symbols should be ordered by F' descending
    And the highest-F' symbols should appear first

  Scenario: Sort by churn multiplier (G)
    Given churn weighting is enabled
    And the DDP sidebar is open
    When the user selects "Sort by G"
    Then files should be ordered by G descending
    And the most frequently-changed files should appear first

  Scenario: Display analysis scope context
    Given analysis was run on the entire workspace
    When the user views the DDP risk view
    Then the view should display scope as "workspace"

  Scenario: Display folder-scoped analysis context
    Given analysis was run on folder "src/core"
    When the user views the DDP risk view
    Then the view should display scope as "src/core"

  Scenario: Double-click filename opens file
    Given the DDP sidebar shows analyzed files
    When the user double-clicks a filename
    Then the corresponding file should open in the editor

  Scenario: File node shows risk metrics
    Given a file with analyzed symbols
    When displayed in the DDP sidebar
    Then the file node should show its rollup risk score
    And the node should show symbol count
    And the node should be color-coded by risk level

  Scenario: Expand file to see symbols
    Given a file node in the DDP sidebar
    When the user expands the file node
    Then child nodes should show each symbol
    And each symbol should display its metrics (CC, T, CRAP, R, F)

  Scenario: Refresh analysis
    Given the DDP sidebar is open
    When the user clicks the refresh button
    Then analysis should re-run on the current scope
    And the view should update with new results
