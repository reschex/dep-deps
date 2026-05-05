Feature: Java Symbol Extraction
  As a developer
  I want accurate method extraction from Java files
  So that risk metrics are calculated for Java codebases without requiring IDE extensions

  Background:
    Given a Java source file analysed by PMD

  Scenario: Extract methods from PMD CyclomaticComplexity violations
    Given PMD XML output with a method "processOrder" at lines 15-28
    When I parse symbols from the PMD XML
    Then 1 symbol should be found
    And the symbol name should be "processOrder"
    And the symbol lines should be 0-based (converted from PMD 1-based)

  Scenario: Extract multiple methods from the same file
    Given PMD XML output with methods "validate" at line 5 and "execute" at line 20
    When I parse symbols from the PMD XML
    Then 2 symbols should be found
    And symbol names should include "validate" and "execute"

  Scenario: Deduplicate same method reported by multiple cyclomatic rules
    Given PMD XML with both CyclomaticComplexity and StdCyclomaticComplexity for method "calc" at line 10
    When I parse symbols from the PMD XML
    Then 1 symbol should be found
    And the symbol name should be "calc"

  Scenario: Ignore non-cyclomatic violations
    Given PMD XML with an UnusedImports violation and a CyclomaticComplexity violation
    When I parse symbols from the PMD XML
    Then only the CyclomaticComplexity method should appear

  Scenario: Graceful degradation on empty PMD output
    Given empty PMD XML output
    When I parse symbols from the PMD XML
    Then 0 symbols should be found

  Scenario: CC=1 methods may be missing
    Given a Java file where some methods have CC=1
    When PMD analyses the file
    Then methods with CC=1 may not appear in the symbol list
    # This is a known limitation: PMD only reports violations for CC >= minimum threshold

  # ── Native symbol extraction (PMD-free) ──────────────────────────────────

  Scenario: Extract all methods from Java source without PMD
    Given a Java file "Service.java" with methods "processOrder" and "validate"
    When I extract symbols using the native Java parser
    Then both methods should be found including CC=1 methods
    And symbol lines should be 0-based

  Scenario: Native extraction finds methods that PMD misses
    Given a Java file with a CC=1 method "simpleGetter"
    When I extract symbols using the native Java parser
    Then "simpleGetter" should be found
    # Unlike PMD, native extraction does not require a minimum CC threshold

  Scenario: Native symbols produce IDs that match call graph edges
    Given a Java file with methods at known line positions
    When I extract symbols using the native Java parser
    And I build call graph edges for the same file
    Then the symbol IDs should match the call edge symbol IDs
    # Both use uri#line:0 format with 0-based lines

  Scenario: Skip constructors in native extraction
    Given a Java file with a constructor and regular methods
    When I extract symbols using the native Java parser
    Then only regular methods should be found
    And constructors should be excluded
