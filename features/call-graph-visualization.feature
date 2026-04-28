Feature: Impact Tree Visualization (Caller Dependency Tree)
  As a developer
  I want to visualize who calls a high-risk symbol (directly and indirectly)
  So that I can understand the impact radius before making changes

  Background:
    Given the DDP extension is active
    And analysis has been run on the workspace
    And call graph edges have been collected

  Scenario: Show impact tree for symbol with direct callers
    Given a symbol "processOrder" exists with the following callers:
      | Symbol ID | Symbol Name        | F Score | Depth |
      | checkout  | handleCheckout     | 189.2   | 1     |
      | apiRoute  | POST /api/checkout | 50.1    | 2     |
    When I right-click on "processOrder" in the DDP sidebar
    And I select "Show Impact Tree"
    Then a QuickPick menu should appear with title "Impact Tree: processOrder"
    And the menu should show "Impact: 2 callers (2 total affected)"
    And the menu should list "handleCheckout" with description "F=189.2 (depth 1)"
    And under "handleCheckout" should show "POST /api/checkout" with "F=50.1 (depth 2)"

  Scenario: Show impact tree for symbol with no callers (entry point)
    Given a symbol "main" exists with no callers
    When I show the impact tree for "main"
    Then the menu should show "Impact: No callers (entry point)"
    And the menu should display "No code depends on this symbol"

  Scenario: Show impact tree for symbol with multiple direct callers
    Given a symbol "validateOrder" exists
    And it is called by "processOrder", "bulkProcess", and "retryOrder"
    When I show the impact tree for "validateOrder"
    Then the menu should show "Impact: 3 direct callers"
    And all three callers should be listed at depth 1

  Scenario: Navigate to caller from impact tree
    Given a symbol "processOrder" exists
    And "processOrder" is called by "handleCheckout"
    When I show the impact tree for "processOrder"
    And I select "handleCheckout" from the QuickPick menu
    Then the editor should navigate to the definition of "handleCheckout"

  Scenario: Multi-level caller tree (transitive dependencies)
    Given the following call hierarchy:
      | Caller        | Callee        |
      | userAction    | handleOrder   |
      | handleOrder   | processOrder  |
      | processOrder  | validateOrder |
    When I show the impact tree for "validateOrder" with maxDepth=3
    Then the caller tree should include:
      | Symbol        | Depth |
      | processOrder  | 1     |
      | handleOrder   | 2     |
      | userAction    | 3     |
    And the menu should show "Impact: 1 direct caller (3 total affected)"

  Scenario: Detect and display recursive caller chains
    Given a symbol "processA" is called by "processB"
    And "processB" is called by "processA" (mutual recursion)
    When I show the impact tree for "processA"
    Then "processB" should appear at depth 1
    And "processA" should appear at depth 2 marked with "🔄 RECURSIVE"
    And the tree expansion should stop at the recursive node

  Scenario: Respect maxDepth configuration
    Given the configuration "ddp.impactTree.maxDepth" is set to 2
    And the following call hierarchy exists:
      | Caller | Callee |
      | D      | C      |
      | C      | B      |
      | B      | A      |
    When I show the impact tree for "A"
    Then the caller tree should only show depth 1 and 2:
      | Symbol | Depth |
      | B      | 1     |
      | C      | 2     |
    And "D" should not appear in the tree
    And the menu should show "Impact: 1 direct caller (2 shown, more exist)"

  Scenario: Show impact tree with no analysis results
    Given no analysis has been run
    When I attempt to show the impact tree for any symbol
    Then an error message should appear: "No analysis results available. Run DDP analysis first."

  Scenario: Show impact tree for non-existent symbol
    Given analysis results exist
    But the symbol "unknownSymbol" is not in the analysis
    When I attempt to show the impact tree for "unknownSymbol"
    Then an error message should appear: "Symbol not found in analysis results."

  Scenario: CLI text-based impact tree output
    Given a CLI analysis has been run
    And a symbol "processOrder" exists with a multi-level caller tree
    When I run "ddp-cli --show-impact processOrder"
    Then the output should be an ASCII tree:
      """
      IMPACT TREE (who calls this):
      └─ handleCheckout [F=189.2] (depth 1)
         ├─ POST /api/checkout [F=50.1] (depth 2)
         │  └─ apiRouter [F=35.0] (depth 3)
         └─ submitOrderForm [F=120.5] (depth 2)

      IMPACT SUMMARY:
      - Direct callers: 1
      - Total affected symbols: 4
      - Highest risk caller: submitOrderForm (F=120.5)
      """

  Scenario: CLI JSON output for impact tree
    Given a CLI analysis has been run
    When I run "ddp-cli --show-impact processOrder --format json"
    Then the output should be valid JSON
    And it should include "impactSummary" with directCallers and totalAffected counts
    And it should include "callers" array with nested structure
    And each node should include "id", "name", "depth", and "metrics"
    And there should be no "callees" field

  Scenario: Export impact tree to Graphviz DOT format
    Given analysis results exist
    When I run "ddp-cli --show-impact processOrder --format dot"
    Then the output should be valid DOT format
    And it should include nodes for all symbols in the caller tree
    And edges should point from callers to callees (showing dependency direction)
    And high-risk caller nodes (F > threshold) should be styled differently
    And depth levels should be visually indicated

  Scenario: Export impact tree to Mermaid format
    Given analysis results exist
    When I run "ddp-cli --show-impact processOrder --format mermaid"
    Then the output should be valid Mermaid syntax
    And it should render a flowchart showing caller hierarchy
    And high-risk callers should be color-coded
    And the target symbol should be highlighted

  Scenario: Impact tree context menu only appears on symbols
    Given the DDP sidebar is open
    When I right-click on a file node
    Then the "Show Impact Tree" option should not appear
    When I right-click on a symbol node
    Then the "Show Impact Tree" option should appear

  Scenario: Performance with large caller trees
    Given a symbol with 100+ direct callers
    When I show the impact tree
    Then the visualization should load within 2 seconds
    And only the first depth level should be shown initially
    And deeper levels should load on-demand (lazy loading)

  Scenario: Impact summary quantifies change risk
    Given a symbol "coreUtility" with the following impact:
      | Direct callers | Total affected | Combined F score |
      | 5              | 23             | 1456.8           |
    When I show the impact tree for "coreUtility"
    Then the menu should display:
      """
      Impact Summary:
      - 5 direct callers
      - 23 total affected symbols (depth 3)
      - Combined risk: F=1456.8
      - Warning: High-impact change
      """

  # ── Phase 4: Full TreeView Panel ──────────────────────────────────────

  Scenario: Impact tree panel shows empty state when no symbol is selected
    Given the DDP Impact Tree panel is visible
    And no symbol has been selected for impact analysis
    Then the panel should show "Select a symbol to view its impact tree"

  Scenario: Impact tree panel shows callers when symbol is selected
    Given a symbol "processOrder" exists with the following callers:
      | Symbol ID | Symbol Name    | F Score | Depth |
      | checkout  | handleCheckout | 189.2   | 1     |
    When I right-click on "processOrder" in the DDP sidebar
    And I select "Show Impact Tree"
    Then the DDP Impact Tree panel should show "handleCheckout" as a collapsible node
    And the node description should show "F=189.2"
    And the node should have a "symbol-function" icon

  Scenario: Lazy-load deeper caller levels on expand
    Given the impact tree panel is rooted at "processOrder"
    And "handleCheckout" calls "processOrder" and "apiRoute" calls "handleCheckout"
    When I expand the "handleCheckout" node in the impact tree panel
    Then "apiRoute" should appear as a child node at depth 2

  Scenario: Navigate to symbol from impact tree panel
    Given the impact tree panel is rooted at "processOrder"
    And "handleCheckout" is shown as a caller
    When I click on "handleCheckout" in the impact tree panel
    Then the editor should navigate to the definition of "handleCheckout"

  Scenario: Re-root impact tree from any caller node
    Given the impact tree panel is rooted at "processOrder"
    And "handleCheckout" is shown as a caller
    When I right-click on "handleCheckout" in the impact tree panel
    And I select "Show Impact Tree"
    Then the impact tree panel should re-root at "handleCheckout"
    And the panel should now show callers of "handleCheckout"

  Scenario: Recursive nodes are marked and non-expandable in tree panel
    Given the impact tree panel is rooted at "processA"
    And "processB" calls "processA" and "processA" calls "processB"
    When I expand "processB" in the impact tree panel
    Then "processA" should appear marked with "RECURSIVE"
    And the "processA" node should not be expandable (no expand arrow)

  Scenario: Impact tree panel shows combined risk summary
    Given a symbol "coreUtility" has 5 direct callers with combined F=1456.8
    When I select "coreUtility" for impact analysis
    Then the impact tree panel should expose a summary with:
      | directCallers | totalAffected | combinedF |
      | 5             | 23            | 1456.8    |

  Scenario: Impact tree panel context menu only on caller nodes
    Given the impact tree panel has caller nodes
    When I right-click on a caller node
    Then the "Show Impact Tree" option should appear
    When the panel shows an empty message node
    Then no context menu options should appear

  Scenario: Impact tree refreshes after new analysis
    Given the impact tree panel is rooted at "processOrder"
    When I run a new DDP analysis
    Then the impact tree panel should refresh with updated metrics
