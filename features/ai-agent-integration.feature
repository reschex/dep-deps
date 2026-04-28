Feature: AI Agent Integration - Risk-Aware Code Modification
  As an AI coding agent
  I want to be automatically warned about high-risk symbols before editing files
  So that I can make informed decisions and avoid introducing cascading failures

  Background:
    Given DDP analysis has been run on the workspace
    And call graph edges have been collected
    And the warn threshold is F=100
    And the block threshold is F=500

  # ─── PreToolUse Hook Scenarios ───────────────────────────────────────────────

  Scenario: Hook warns before editing a file with high-risk symbols
    Given a file "src/core/analyze.ts" contains a symbol "computeSymbolMetrics" with F=847.2
    And the file contains a symbol "computeRanks" with F=312.1
    When the agent attempts to edit "src/core/analyze.ts"
    Then the PreToolUse hook should run before the edit executes
    And the hook output should contain "HIGH RISK" for "computeSymbolMetrics"
    And the hook output should contain "F=847.2"
    And the hook output should contain the rank score "R=46.3"
    And the hook output should contain the direct caller count
    And the edit should still proceed (warning only)

  Scenario: Hook blocks edit of file with critically high-risk symbol
    Given a file "src/core/analyze.ts" contains a symbol "computeSymbolMetrics" with F=847.2
    And the block threshold is configured as F=500
    When the agent attempts to edit "src/core/analyze.ts"
    Then the PreToolUse hook should exit with code 2
    And the edit should be blocked
    And the hook output should explain why the edit was blocked
    And the hook output should suggest running "ddp callers" to review the impact tree
    And the hook output should instruct the agent to acknowledge the risk before retrying

  Scenario: Hook passes through silently for low-risk files
    Given a file "src/shared/fakeProc.ts" where all symbols have F<=100
    When the agent attempts to edit "src/shared/fakeProc.ts"
    Then the PreToolUse hook should run
    And the hook should produce no warning output
    And the hook should exit with code 0
    And the edit should proceed without interruption

  Scenario: Hook skips non-source files
    Given the agent attempts to edit ".github/workflows/ci.yml"
    When the PreToolUse hook runs
    Then the hook should skip DDP analysis entirely
    And the hook should exit with code 0 silently
    And no DDP analysis should be spawned

  Scenario: Hook warning includes caller count derived from R score
    Given a symbol "processOrder" with R=8.7 and F=234.1
    When the PreToolUse hook runs before an edit to its file
    Then the warning should mention that approximately 8 other functions depend on this symbol
    And the warning should recommend reviewing the caller tree with "ddp callers"

  Scenario: Hook handles missing DDP analysis gracefully
    Given DDP analysis has not been run on the workspace
    And no coverage or call graph data is available
    When the PreToolUse hook runs before an edit
    Then the hook should not crash
    And the hook should output a notice that DDP analysis is unavailable
    And the hook should exit with code 0 (no false blocks)

  Scenario: Hook respects skipPatterns configuration
    Given the configuration has "skipPatterns": ["**/*.test.ts", "**/*.spec.ts"]
    When the agent attempts to edit "src/core/analyze.test.ts"
    Then the PreToolUse hook should skip the file
    And no warning should be produced

  Scenario: Hook thresholds are configurable per project
    Given a ".ddprc.json" file with:
      """
      {
        "agentIntegration": {
          "warnThreshold": 50,
          "blockThreshold": 200
        }
      }
      """
    And a file contains a symbol with F=175
    When the agent edits the file
    Then the hook should warn (F=175 > warnThreshold=50)
    And the hook should block (F=175 < blockThreshold=200) should NOT occur
    And the edit should proceed after the warning

  # ─── CLI Caller-Tree Output Scenarios ────────────────────────────────────────

  Scenario: CLI returns caller tree in text format for LLM consumption
    Given a symbol "processOrder" with direct callers "handleCheckout" and "bulkProcess"
    When I run "ddp callers --file src/orders.ts --symbol processOrder --format text"
    Then the output should begin with a risk header showing F, R, CC, T, and CRAP
    And the output should show a risk level label (LOW / MEDIUM / HIGH / CRITICAL)
    And the output should show an indented caller tree
    And each node should show its F score and depth
    And the output should end with an IMPACT SUMMARY section
    And the output should be optimised for LLM readability (no machine-only symbols)

  Scenario: CLI returns caller tree in JSON format for programmatic consumption
    Given a symbol "processOrder" exists with callers
    When I run "ddp callers --file src/orders.ts --symbol processOrder --format json"
    Then the output should be valid JSON
    And the root object should have a "symbol" field
    And the root object should have a "metrics" object with cc, t, crap, r, f fields
    And the root object should have a "riskLevel" field ("LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
    And the root object should have an "impactSummary" object with directCallers and totalAffected
    And the root object should have a "callerTree" array
    And each node in the tree should have "id", "depth", "recursive", "metrics", and "callers" fields

  Scenario: CLI risk level labels map to F score ranges
    Given the following symbols with F scores:
      | Symbol | F Score | Expected Risk Level |
      | alpha  | 25      | LOW                 |
      | beta   | 150     | MEDIUM              |
      | gamma  | 350     | HIGH                |
      | delta  | 650     | CRITICAL            |
    When I run "ddp callers" for each symbol
    Then each symbol should be labelled with its expected risk level

  Scenario: CLI respects maxDepth argument
    Given a call chain 5 levels deep: E calls D calls C calls B calls A
    When I run "ddp callers --symbol A --depth 3"
    Then the caller tree should include B (depth 1), C (depth 2), D (depth 3)
    And E should not appear in the tree
    And the IMPACT SUMMARY should note that more callers exist beyond the depth limit

  # ─── MCP Server Scenarios ────────────────────────────────────────────────────

  Scenario: MCP tool ddp_analyze_file returns all symbol metrics
    Given an MCP server is running with DDP analysis available
    When an agent calls "ddp_analyze_file" with path "src/core/analyze.ts"
    Then the result should be an array of SymbolMetrics objects
    And each object should have fields: id, name, uri, cc, t, r, crap, f
    And the array should be sorted by F score descending by default

  Scenario: MCP tool ddp_caller_tree returns nested caller tree
    Given an MCP server is running
    When an agent calls "ddp_caller_tree" with symbol "computeSymbolMetrics" in "src/core/analyze.ts"
    Then the result should match the JSON format from "ddp callers --format json"
    And the result should include nested callerTree with per-node metrics
    And the result should include an impactSummary object

  Scenario: MCP tool ddp_high_risk_symbols returns filtered list
    Given an MCP server is running
    And the file "src/core/analyze.ts" has 3 symbols above F=100 and 2 below
    When an agent calls "ddp_high_risk_symbols" with path "src/core/analyze.ts" and fMin=100
    Then only the 3 high-risk symbols should be returned
    And the result should be sorted by F score descending

  Scenario: MCP tool ddp_workspace_hotspots returns top N across workspace
    Given an MCP server is running
    And the workspace has been analysed
    When an agent calls "ddp_workspace_hotspots" with topN=10
    Then the result should contain at most 10 symbols
    And the symbols should be the highest F-scored across all files
    And each symbol should include its file path

  # ─── Agent Workflow Scenarios ────────────────────────────────────────────────

  Scenario: Agent queries caller tree before modifying a high-risk symbol
    Given an AI agent is tasked with modifying "computeSymbolMetrics"
    And DDP analysis is available via MCP tools or CLI
    When the agent runs "ddp callers" or calls "ddp_caller_tree" before editing
    Then the agent should receive the impact summary
    And the agent should be able to identify the highest-risk callers
    And the agent should be able to articulate the blast radius of the change
    And the agent should recommend adding tests to reduce F before proceeding

  Scenario: Agent sees PreToolUse warning and acknowledges risk
    Given the PreToolUse hook is configured
    And a file contains a symbol with F=847.2 (HIGH RISK)
    When the agent attempts an edit and receives the warning
    Then the agent should surface the warning to the user
    And the agent should not silently proceed past a CRITICAL risk warning
    And the agent should suggest one or more risk-reduction actions:
      | Action                    | Effect              |
      | Write tests first         | Reduces T → lowers CRAP → lowers F |
      | Refactor to reduce CC     | Lowers CC → lowers CRAP → lowers F |
      | Decouple callers          | Lowers R → lowers F directly       |

  Scenario: CLAUDE.md safety protocol triggers without hook installed
    Given the PreToolUse hook is not installed
    But CLAUDE.md contains the Code Modification Safety Protocol
    When an agent is asked to modify "src/core/analyze.ts"
    Then the agent should run "ddp analyze" before making changes (per CLAUDE.md instructions)
    And the agent should check if any symbol exceeds the warn threshold
    And the agent should report risk scores to the user before proceeding
