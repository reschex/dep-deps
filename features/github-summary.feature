Feature: GitHub Actions Summary Format
  As a GitHub Actions workflow
  I want a formatted markdown summary with sortable tables
  So that developers can quickly identify risky code in PR checks

  Scenario: Generate markdown summary structure
    Given analysis has completed
    When I format output as "github-summary"
    Then the output should be valid markdown
    And the output should start with "# DDP Analysis Report"
    And the output should contain a summary section
    And the output should contain a files table

  Scenario: Include summary statistics
    Given 45 files analyzed with 423 symbols
    When I format output as "github-summary"
    Then the summary should show "Files Analyzed: 45"
    And the summary should show "Symbols Analyzed: 423"

  Scenario: Generate sortable HTML table
    When I format output as "github-summary"
    Then the output should contain a <table> element
    And the table should have id="ddp-files"
    And column headers should have onclick="sortTable(N)" attributes
    And the output should include sorting JavaScript

  Scenario: Color code risk levels (high risk)
    Given a file with max F' = 25
    When I format the file row
    Then the row should have class "risk-high"
    And the row background should be red-tinted

  Scenario: Color code risk levels (medium risk)
    Given a file with max F' = 15
    When I format the file row
    Then the row should have class "risk-medium"
    And the row background should be yellow-tinted

  Scenario: Color code risk levels (low risk)
    Given a file with max F' = 5
    When I format the file row
    Then the row should have class "risk-low"
    And the row background should be green-tinted

  Scenario: Limit top files displayed
    Given 100 files analyzed
    And configuration sets topFilesCount = 20
    When I format output as "github-summary"
    Then only the top 20 riskiest files should be shown

  Scenario: Include top risky symbols section
    Given the top 5 riskiest symbols
    When I format output as "github-summary"
    Then a "Top Riskiest Symbols" section should exist
    And it should list symbols with their metrics
    And it should be in an expandable <details> block

  Scenario: Table sorting functionality
    When I include sorting JavaScript
    Then clicking a column header should sort rows
    And sorting should handle both numeric and text columns
    And sorting direction should toggle (asc/desc)
