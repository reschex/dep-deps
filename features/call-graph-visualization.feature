Feature: Call Graph Visualization
  As a developer
  I want to visualize the call graph for high-risk symbols
  So that I can understand the impact of changing a function

  Background:
    Given the DDP extension is active
    And analysis has been run on the workspace
    And call graph edges have been collected

  Scenario: Show call graph for symbol with callers and callees
    Given a symbol "processOrder" exists with the following dependencies:
      | Direction | Symbol ID | Symbol Name        | F Score |
      | caller    | checkout  | handleCheckout     | 189.2   |
      | caller    | apiRoute  | POST /api/checkout | 50.1    |
      | callee    | validator | validateOrder      | 156.3   |
      | callee    | taxCalc   | calculateTax       | 89.7    |
    When I right-click on "processOrder" in the DDP sidebar
    And I select "Show Call Graph"
    Then a QuickPick menu should appear with title "Call Graph: processOrder"
    And the menu should show section "Callers (who calls processOrder)"
    And the menu should list "handleCheckout" with description "F=189.2"
    And the menu should list "POST /api/checkout" with description "F=50.1"
    And the menu should show section "Callees (what processOrder calls)"
    And the menu should list "validateOrder" with description "F=156.3"
    And the menu should list "calculateTax" with description "F=89.7"

  Scenario: Show call graph for symbol with no callers
    Given a symbol "main" exists with no callers
    And "main" calls "initialize" and "run"
    When I show the call graph for "main"
    Then the "Callers" section should show "(none)"
    And the "Callees" section should list "initialize" and "run"

  Scenario: Show call graph for symbol with no callees
    Given a symbol "leafFunction" exists with no callees
    And "leafFunction" is called by "parentA" and "parentB"
    When I show the call graph for "leafFunction"
    Then the "Callers" section should list "parentA" and "parentB"
    And the "Callees" section should show "(none)"

  Scenario: Navigate to symbol from call graph
    Given a symbol "processOrder" exists
    And "processOrder" is called by "handleCheckout"
    When I show the call graph for "processOrder"
    And I select "handleCheckout" from the QuickPick menu
    Then the editor should navigate to the definition of "handleCheckout"

  Scenario: Multi-level caller tree (depth > 1)
    Given the following call hierarchy:
      | Caller        | Callee        | Level |
      | userAction    | handleOrder   | 3     |
      | handleOrder   | processOrder  | 2     |
      | processOrder  | validateOrder | 1     |
    When I show the call graph for "validateOrder" with maxDepth=3
    Then the caller tree should include:
      | Symbol        | Depth |
      | processOrder  | 1     |
      | handleOrder   | 2     |
      | userAction    | 3     |

  Scenario: Detect and display recursive calls
    Given a symbol "recursiveFunction" exists
    And "recursiveFunction" calls itself (directly or indirectly)
    When I show the call graph for "recursiveFunction"
    Then the recursive call should be marked with "🔄 RECURSIVE"
    And the tree expansion should stop at the recursive node

  Scenario: Respect maxDepth configuration
    Given the configuration "ddp.callGraph.maxDepth" is set to 2
    And the following call hierarchy exists:
      | Caller | Callee | Level |
      | D      | C      | 3     |
      | C      | B      | 2     |
      | B      | A      | 1     |
    When I show the call graph for "A"
    Then the caller tree should only show depth 1 and 2:
      | Symbol | Depth |
      | B      | 1     |
      | C      | 2     |
    And "D" should not appear in the tree

  Scenario: Show call graph with no analysis results
    Given no analysis has been run
    When I attempt to show the call graph for any symbol
    Then an error message should appear: "No analysis results available. Run DDP analysis first."

  Scenario: Show call graph for non-existent symbol
    Given analysis results exist
    But the symbol "unknownSymbol" is not in the analysis
    When I attempt to show the call graph for "unknownSymbol"
    Then an error message should appear: "Symbol not found in analysis results."

  Scenario: CLI text-based call graph output
    Given a CLI analysis has been run
    And a symbol "processOrder" exists with callers and callees
    When I run "ddp-cli --show-graph processOrder"
    Then the output should be an ASCII tree:
      """
      CALLERS (who calls this):
      ├─ handleCheckout [F=189.2]
      └─ POST /api/checkout [F=50.1]

      CALLEES (what this calls):
      ├─ validateOrder [F=156.3]
      ├─ calculateTax [F=89.7]
      └─ saveToDatabase [F=512.8]
      """

  Scenario: CLI JSON output for call graph
    Given a CLI analysis has been run
    When I run "ddp-cli --show-graph processOrder --format json"
    Then the output should be valid JSON
    And it should include "callers" array with nested structure
    And it should include "callees" array with nested structure
    And each node should include "id", "name", and "metrics"

  Scenario: Export call graph to Graphviz DOT format
    Given analysis results exist
    When I run "ddp-cli --show-graph processOrder --format dot"
    Then the output should be valid DOT format
    And it should include nodes for all symbols in the graph
    And it should include edges with direction
    And high-risk nodes (F > threshold) should be styled differently

  Scenario: Export call graph to Mermaid format
    Given analysis results exist
    When I run "ddp-cli --show-graph processOrder --format mermaid"
    Then the output should be valid Mermaid syntax
    And it should render a flowchart graph
    And high-risk nodes should be color-coded

  Scenario: Call graph context menu only appears on symbols
    Given the DDP sidebar is open
    When I right-click on a file node
    Then the "Show Call Graph" option should not appear
    When I right-click on a symbol node
    Then the "Show Call Graph" option should appear

  Scenario: Performance with large call graphs
    Given a symbol with 100+ direct callers
    When I show the call graph
    Then the visualization should load within 2 seconds
    And only the first depth level should be loaded initially
    And deeper levels should load on-demand (lazy loading)
