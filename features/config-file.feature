Feature: Configuration file loading
  As a developer using DDP
  I want to configure analysis via a .ddprc.json file
  So that settings are shared across CLI, VS Code, and MCP server

  Background:
    Given DDP is installed

  Scenario: Load valid configuration file
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": 500,
        "fileFilter": {
          "respectGitignore": true,
          "excludePatterns": ["**/*.test.*"]
        },
        "coverage": {
          "lcovGlob": "**/lcov.info"
        },
        "churn": {
          "enabled": true,
          "lookbackDays": 60
        }
      }
      """
    When I load the configuration from the project root
    Then maxFiles should be 500
    And fileFilter.respectGitignore should be true
    And coverage.lcovGlob should be "**/lcov.info"
    And churn.lookbackDays should be 60
    And all unspecified fields should use defaults

  Scenario: Missing configuration file returns defaults
    Given no ".ddprc.json" file exists in the project root
    When I load the configuration from the project root
    Then all fields should use default values
    And no error should be thrown

  Scenario: Invalid JSON syntax logs warning and returns defaults
    Given a ".ddprc.json" file with invalid JSON syntax
    When I load the configuration from the project root
    Then a warning should be logged with the parse error
    And all fields should use default values

  Scenario: Unknown keys are ignored (forward-compatible)
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": 200,
        "futureFeature": { "enabled": true },
        "anotherUnknownKey": 42
      }
      """
    When I load the configuration from the project root
    Then maxFiles should be 200
    And unknown keys should not cause errors

  Scenario: Agent integration thresholds are loaded
    Given a ".ddprc.json" configuration file with:
      """
      {
        "agentIntegration": {
          "warnThreshold": 50,
          "blockThreshold": 200,
          "skipTestFiles": true,
          "skipPatterns": ["**/*.test.ts", "**/*.spec.ts"]
        }
      }
      """
    When I load the configuration from the project root
    Then agentIntegration.warnThreshold should be 50
    And agentIntegration.blockThreshold should be 200
    And agentIntegration.skipTestFiles should be true

  Scenario: Partial configuration merges with defaults
    Given a ".ddprc.json" configuration file with:
      """
      {
        "churn": {
          "enabled": true
        }
      }
      """
    When I load the configuration from the project root
    Then churn.enabled should be true
    And churn.lookbackDays should use the default value
    And all other sections should use defaults

  Scenario: Type-mismatched scalar values fall back to defaults silently
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": "lots",
        "churn": { "lookbackDays": "90" }
      }
      """
    When I load the configuration from the project root
    Then maxFiles should use the default value
    And churn.lookbackDays should use the default value
    And no warning should be logged for type mismatches

  Scenario: Array at JSON root is rejected with a warning
    Given a ".ddprc.json" file containing only "[1, 2, 3]"
    When I load the configuration from the project root
    Then a warning should be logged matching /expected an object at root/
    And all fields should use default values

  Scenario: Primitive at JSON root is rejected with a warning
    Given a ".ddprc.json" file containing only "42"
    When I load the configuration from the project root
    Then a warning should be logged
    And all fields should use default values

  Scenario: Configuration priority order (CLI)
    Given a ".ddprc.json" sets maxFiles to 100
    And the CLI is invoked with no --max-files flag
    Then the resolved maxFiles is 100
    But when the CLI flag overrides the value
    Then the CLI value wins over the config file
    And the config file wins over the built-in defaults

  Scenario: VS Code extension merges .ddprc.json with workspace settings
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": 200,
        "coverage": { "lcovGlob": "**/custom/lcov.info" },
        "churn": { "enabled": true, "lookbackDays": 60 }
      }
      """
    And the VS Code workspace does not override any DDP settings
    When the VS Code extension merges configuration
    Then the resolved maxFiles is 200
    And the resolved coverage.lcovGlob is "**/custom/lcov.info"
    And the resolved churn.enabled is true
    And VS Code-only fields use their defaults

  Scenario: VS Code workspace settings override .ddprc.json
    Given a ".ddprc.json" sets maxFiles to 200
    And the VS Code workspace explicitly sets maxFiles to 300
    When the VS Code extension merges configuration
    Then the resolved maxFiles is 300
    And the VS Code explicit setting wins over the config file

  Scenario: MCP server loads .ddprc.json for analysis
    Given a ".ddprc.json" configuration file with:
      """
      {
        "maxFiles": 250,
        "coverage": { "lcovGlob": "**/custom/lcov.info" },
        "fileFilter": { "respectGitignore": true }
      }
      """
    When the MCP server resolves analysis options from the config
    Then the analysis options use maxFiles of 250
    And the analysis options use lcovGlob of "**/custom/lcov.info"
    And the analysis options use respectGitignore of true
