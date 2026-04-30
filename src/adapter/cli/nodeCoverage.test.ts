/**
 * Tests for NodeCoverageProvider - Coverage Data Loading
 *
 * Scenario: Load LCOV coverage file
 * From: features/coverage-integration.feature
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { NodeCoverageProvider } from './nodeCoverage';

const FIXTURE_PATH = join(__dirname, '../../test/fixtures/cli/simple-project');

describe('NodeCoverageProvider', () => {
  describe('Scenario: Load LCOV coverage file', () => {
    it('should load coverage data from an LCOV file', async () => {
      // Given a project with coverage/lcov.info
      const provider = new NodeCoverageProvider(
        FIXTURE_PATH,
        '**/coverage/lcov.info'
      );

      // When I load coverage
      await provider.loadCoverage();

      // Then coverage data should be available for src/utils.ts
      const utilsUri = pathToFileURL(join(FIXTURE_PATH, 'src', 'utils.ts')).toString();
      const statements = provider.getStatements(utilsUri);
      expect(statements).toBeDefined();
      expect(statements!.length).toBeGreaterThan(0);
    });

    it('should have executed statements for covered lines', async () => {
      // Given coverage data is loaded
      const provider = new NodeCoverageProvider(
        FIXTURE_PATH,
        '**/coverage/lcov.info'
      );
      await provider.loadCoverage();

      // When I look at src/utils.ts coverage
      const utilsUri = pathToFileURL(join(FIXTURE_PATH, 'src', 'utils.ts')).toString();
      const statements = provider.getStatements(utilsUri);

      // Then line 1 (0-indexed: DA:2 → line 1) should be executed
      const line1 = statements!.find(s => s.startLine === 1);
      expect(line1).toBeDefined();
      expect(line1!.executed).toBe(true);
    });
  });

  describe('Scenario: Handle missing coverage file gracefully', () => {
    it('should complete without error when no LCOV files exist', async () => {
      // Given no coverage files exist
      const provider = new NodeCoverageProvider(
        FIXTURE_PATH,
        '**/nonexistent/lcov.info'
      );

      // When I load coverage (should not throw)
      await provider.loadCoverage();

      // Then getStatements should return undefined for any URI
      const utilsUri = pathToFileURL(join(FIXTURE_PATH, 'src', 'utils.ts')).toString();
      expect(provider.getStatements(utilsUri)).toBeUndefined();
    });
  });

  describe('Scenario: Coverage data keyed by file URI', () => {
    it('should return undefined for a file not in coverage data', async () => {
      // Given coverage loaded for src/utils.ts and src/main.ts
      const provider = new NodeCoverageProvider(
        FIXTURE_PATH,
        '**/coverage/lcov.info'
      );
      await provider.loadCoverage();

      // When I query a file not in coverage
      const unknownUri = pathToFileURL(join(FIXTURE_PATH, 'src', 'unknown.ts')).toString();

      // Then undefined should be returned
      expect(provider.getStatements(unknownUri)).toBeUndefined();
    });
  });
});
