Feature: Java Call Graph Extraction
  As a developer using DDP analysis on Java projects
  I want call graph edges extracted from Java source files
  So that the Rank (R) metric reflects actual dependency relationships for Java code

  Background:
    Given Java source files are available on disk

  Scenario: Extract cross-file call edge via field reference
    Given a file "Service.java" containing:
      """
      public class Service {
        private Repository repository;
        public void process() {
          repository.save();
        }
      }
      """
    And a file "Repository.java" containing:
      """
      public class Repository {
        public void save() {}
      }
      """
    When I build call edges for both files
    Then 1 call edge should be found
    And the edge caller should reference "process"
    And the edge callee should reference "save"

  Scenario: Extract this-qualified method call within same class
    Given a file "Service.java" containing:
      """
      public class Service {
        public void process() {
          this.validate();
        }
        public void validate() {}
      }
      """
    When I build call edges for that file
    Then 1 call edge should be found
    And the edge caller should reference "process"
    And the edge callee should reference "validate"

  Scenario: Extract unqualified method call within same class
    Given a file "Service.java" containing:
      """
      public class Service {
        public void process() {
          validate();
        }
        public void validate() {}
      }
      """
    When I build call edges for that file
    Then 1 call edge should be found
    And the edge caller should reference "process"
    And the edge callee should reference "validate"

  Scenario: Deduplicate repeated calls
    Given a file "Service.java" containing:
      """
      public class Service {
        private Repository repository;
        public void process() {
          repository.save();
          repository.save();
        }
      }
      """
    And a file "Repository.java" containing:
      """
      public class Repository {
        public void save() {}
      }
      """
    When I build call edges for both files
    Then 1 call edge should be found

  Scenario: Exclude self-calls (recursive methods)
    Given a file "Recursive.java" containing:
      """
      public class Recursive {
        public void countdown(int n) {
          if (n > 0) countdown(n - 1);
        }
      }
      """
    When I build call edges for that file
    Then 0 call edges should be found

  Scenario: Multi-layer call chain produces correct edges
    Given a file "Service.java" calling Repository methods
    And a file "Repository.java" calling Util methods
    And a file "Util.java" with no outbound calls
    When I build call edges for all three files
    Then edges from Service to Repository should exist
    And edges from Repository to Util should exist
    And no edges from Util should exist

  Scenario: Symbol IDs match JavaSymbolProvider format
    Given a Java file with a method at a known line
    When I build call edges referencing that method
    Then the callee symbol ID should match the format "uri#line:0"
    And line should be 0-based

  Scenario: Graceful degradation on malformed source
    Given a Java file with syntax errors
    When I build call edges for that file
    Then 0 call edges should be found
    And no error should be thrown

  Scenario: Constructor parameter type resolution
    Given a file "Service.java" containing:
      """
      public class Service {
        private final Repository repo;
        public Service(Repository repo) {
          this.repo = repo;
        }
        public void run() {
          repo.save();
        }
      }
      """
    And a file "Repository.java" containing:
      """
      public class Repository {
        public void save() {}
      }
      """
    When I build call edges for both files
    Then 1 call edge should be found
    And the edge callee should reference "save"

  # Known limitation: PMD-based JavaSymbolProvider only reports methods with CC >= 2.
  # Methods with CC=1 appear as call graph edges but may not have corresponding symbols,
  # so their R contribution is lost. This is acceptable for the MVP.
