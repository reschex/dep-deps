Feature: Rank Computation (PageRank)
  As a developer
  I want accurate rank (R) values computed from the call graph
  So that failure risk reflects dependency importance

  Background:
    Given a project with a call graph

  Scenario: Simple star call graph
    Given callee M is called directly by 6 methods
    And each caller has converged rank = 1
    When rank iteration completes
    Then M's rank should be 7
    # R = 1 + (6 × 1) = 7 after convergence

  Scenario: Proportional split among multiple callees
    Given caller P has rank = 4
    And P calls 3 callees
    And P has no other inbound edges
    When one iteration distributes rank
    Then each callee should receive 1.33 from P
    # Each callee gets 4/3 = 1.33 (plus base rank)

  Scenario: Multiple callers to single callee
    Given callee X is called by caller A with rank = 2
    And callee X is called by caller B with rank = 3
    When rank iteration completes
    Then X's rank should include contributions from both A and B

  Scenario: Rank convergence within epsilon
    Given a complex call graph with 20 symbols
    And epsilon is set to 0.001
    When rank computation runs
    Then ranks should converge within 100 iterations
    And final ranks should be stable within epsilon

  Scenario: Isolated symbol has rank = 1
    Given a symbol with no callers (not called by anyone)
    When rank computation completes
    Then the symbol's rank should be 1
    # Base rank when no dependencies
