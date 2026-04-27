Feature: TypeScript Symbol Extraction
  As a QA engineer
  I want accurate function/method extraction from TypeScript files
  So that risk metrics are calculated at the correct granularity

  Scenario: Extract function declarations
    Given a TypeScript file with content:
      """
      function processData(input: string): number {
        if (input.length > 0) {
          return input.length;
        }
        return 0;
      }
      """
    When I extract symbols from the file
    Then 1 symbol should be found
    And the symbol name should be "processData"
    And the symbol body should start at line 1
    And the symbol body should end at line 6

  Scenario: Extract method declarations from classes
    Given a TypeScript file with content:
      """
      class DataProcessor {
        process(data: string): void {
          console.log(data);
        }
        
        validate(input: string): boolean {
          return input.length > 0;
        }
      }
      """
    When I extract symbols from the file
    Then 2 symbols should be found
    And symbol names should include "process"
    And symbol names should include "validate"

  Scenario: Extract arrow functions with names
    Given a TypeScript file with content:
      """
      const calculateRisk = (cc: number, coverage: number): number => {
        return cc * (1 - coverage);
      };
      """
    When I extract symbols from the file
    Then 1 symbol should be found
    And the symbol name should be "calculateRisk"

  Scenario: Handle anonymous arrow functions
    Given a TypeScript file with content:
      """
      const handler = () => {
        return true;
      };
      """
    When I extract symbols from the file
    Then 1 symbol should be found
    And the symbol should have a valid identifier

  Scenario: Extract async functions
    Given a TypeScript file with content:
      """
      async function fetchData(): Promise<string> {
        return await fetch('/api/data');
      }
      """
    When I extract symbols from the file
    Then 1 symbol should be found
    And the symbol name should be "fetchData"

  Scenario: Extract generator functions
    Given a TypeScript file with content:
      """
      function* generateValues() {
        yield 1;
        yield 2;
      }
      """
    When I extract symbols from the file
    Then 1 symbol should be found
    And the symbol name should be "generateValues"

  Scenario: Skip non-function symbols
    Given a TypeScript file with content:
      """
      const VALUE = 42;
      interface Config { }
      type Handler = () => void;
      enum Status { Active, Inactive }
      """
    When I extract symbols from the file
    Then 0 symbols should be found

  Scenario: Handle nested functions
    Given a TypeScript file with content:
      """
      function outer() {
        function inner() {
          return 1;
        }
        return inner();
      }
      """
    When I extract symbols from the file
    Then 2 symbols should be found
    And symbol names should include "outer" and "inner"
