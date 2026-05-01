Feature: Python Symbol Extraction
  As a developer
  I want accurate function/method extraction from Python files
  So that risk metrics are calculated for Python codebases without requiring IDE extensions

  Background:
    Given a Python source file

  Scenario: Extract top-level function
    Given a Python file with content:
      """
      def top_level():
          pass
      """
    When I extract symbols from the Python file
    Then 1 symbol should be found
    And the symbol name should be "top_level"
    And the symbol lines should be 0-based

  Scenario: Extract class methods
    Given a Python file with content:
      """
      class MyClass:
          def method(self):
              pass

          async def async_method(self):
              pass
      """
    When I extract symbols from the Python file
    Then 2 symbols should be found
    And symbol names should include "method" and "async_method"

  Scenario: Extract nested functions
    Given a Python file with content:
      """
      def outer():
          def inner():
              pass
          return inner
      """
    When I extract symbols from the Python file
    Then 2 symbols should be found
    And symbol names should include "outer" and "inner"

  Scenario: Graceful degradation on syntax error
    Given a Python file with invalid syntax
    When I extract symbols from the Python file
    Then 0 symbols should be found
    And no exception should be thrown

  Scenario: Graceful degradation on empty file
    Given an empty Python file
    When I extract symbols from the Python file
    Then 0 symbols should be found

  Scenario: Graceful degradation on malformed JSON output
    Given the Python extraction script returns malformed output
    When the output is parsed
    Then 0 symbols should be returned
    And no exception should be thrown
