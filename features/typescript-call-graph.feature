Feature: TypeScript Call Graph Extraction
  As a developer using DDP analysis
  I want call graph edges extracted from TypeScript/JavaScript source files
  So that the Rank (R) metric reflects actual dependency relationships

  Background:
    Given the TypeScript Compiler API is available

  Scenario: Extract cross-file call edge
    Given a file "caller.ts" containing:
      """
      import { greet } from './callee';
      export function run() {
        greet('world');
      }
      """
    And a file "callee.ts" containing:
      """
      export function greet(name: string): void {
        console.log(`Hello, ${name}`);
      }
      """
    When I build call edges for both files
    Then 1 call edge should be found
    And the edge caller should reference "run"
    And the edge callee should reference "greet"

  Scenario: Deduplicate repeated calls
    Given a file "caller.ts" containing:
      """
      import { greet } from './callee';
      export function run() {
        greet('hello');
        greet('world');
      }
      """
    And a file "callee.ts" containing:
      """
      export function greet(name: string): void {}
      """
    When I build call edges for both files
    Then 1 call edge should be found

  Scenario: Exclude self-calls (recursive functions)
    Given a file "recursive.ts" containing:
      """
      export function countdown(n: number): void {
        if (n > 0) countdown(n - 1);
      }
      """
    When I build call edges for that file
    Then 0 call edges should be found

  Scenario: Skip declaration files
    Given a file "lib.d.ts" containing type declarations
    When I build call edges including the declaration file
    Then edges from declaration files should be excluded

  Scenario: Arrow function calls
    Given a file "arrows.ts" containing:
      """
      const helper = () => 42;
      export const main = () => helper();
      """
    When I build call edges for that file
    Then 1 call edge should be found
    And the edge caller should reference "main"
    And the edge callee should reference "helper"

  Scenario: Method calls within a class
    Given a file "service.ts" containing:
      """
      class Service {
        process() { this.validate(); }
        validate() {}
      }
      """
    When I build call edges for that file
    Then 1 call edge should be found
    And the edge caller should reference "process"
    And the edge callee should reference "validate"

  Scenario: Symbol IDs match NodeSymbolProvider format
    Given a file "callee.ts" with a known function position
    When I build call edges referencing that function
    Then the callee symbol ID should match the format "uri#line:character"
    And line and character should be 0-based

  # Known limitation: constructor calls (new Widget()) are not currently tracked.
  # resolveCalleeId resolves the class symbol, which is a ClassDeclaration — not a
  # function-like declaration — so no edge is emitted. Implementing this requires
  # NodeSymbolProvider to also extract ConstructorDeclarations.
