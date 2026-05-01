/**
 * Tests for CLI Analysis Pipeline - End-to-End Wiring
 *
 * Scenario: Run analysis with default options (tracer bullet)
 * From: features/cli-command-interface.feature, features/end-to-end-workflow.feature
 *
 * Verifies that the CLI adapter pipeline (NodeDocumentProvider + NodeSymbolProvider +
 * NodeCoverageProvider + FallbackCcProvider) produces valid AnalysisResult when
 * orchestrated together — without any VS Code dependency.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'url';
import { runCliAnalysis } from './cliAnalysis';
import { formatAnalysisAsJson, type JsonOutput } from './formatJson';

const FIXTURE_PATH = join(__dirname, '../../test/fixtures/cli/simple-project');

describe('CLI Analysis Pipeline', () => {
  describe('Scenario: Run analysis with default options', () => {
    it('should produce an AnalysisResult with symbols', async () => {
      // Given a TypeScript project with source files and coverage data
      // When I run CLI analysis on the fixture project
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then the analysis should complete successfully with symbols
      expect(result).toBeDefined();
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should extract the "add" function from utils.ts', async () => {
      // Given src/utils.ts contains function add(a, b)
      // When I run CLI analysis
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then a symbol named "add" should be present
      const addSymbol = result.symbols.find(s => s.name === 'add');
      expect(addSymbol).toBeDefined();
    });

    it('should compute CC >= 1 for every symbol', async () => {
      // When I run CLI analysis
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then every symbol should have CC >= 1 (minimum cyclomatic complexity)
      for (const sym of result.symbols) {
        expect(sym.cc).toBeGreaterThanOrEqual(1);
      }
    });

    it('should compute CRAP and F for every symbol', async () => {
      // When I run CLI analysis
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then every symbol should have finite CRAP and F values
      for (const sym of result.symbols) {
        expect(Number.isFinite(sym.crap)).toBe(true);
        expect(Number.isFinite(sym.f)).toBe(true);
      }
    });

    it('should include coverage data from LCOV', async () => {
      // Given coverage/lcov.info exists in the fixture project with hits for utils.ts
      // When I run CLI analysis
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then the "add" function should have coverage > 0
      const addSymbol = result.symbols.find(s => s.name === 'add');
      expect(addSymbol).toBeDefined();
      expect(addSymbol!.t).toBeGreaterThan(0);
    });

    it('should have R = 1 for all symbols (no call graph in CLI MVP)', async () => {
      // When I run CLI analysis (call graph not yet implemented)
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // Then all symbols should have R = 1 (default rank without call graph)
      for (const sym of result.symbols) {
        expect(sym.r).toBe(1);
      }
    });
  });

  describe('Scenario: Respect .gitignore when configured', () => {
    it('should exclude files matching .gitignore patterns when respectGitignore is true', async () => {
      // Given a project with a .gitignore that ignores "generated/"
      const dir = await mkdtemp(join(tmpdir(), 'ddp-cli-gitignore-'));
      try {
        await mkdir(join(dir, 'src'), { recursive: true });
        await mkdir(join(dir, 'generated'), { recursive: true });
        await writeFile(join(dir, '.gitignore'), 'generated/\n');
        await writeFile(join(dir, 'src', 'main.ts'), 'export function main() { return 1; }\n');
        await writeFile(join(dir, 'generated', 'api.ts'), 'export function callApi() { return 2; }\n');

        // When I run CLI analysis with respectGitignore enabled
        const result = await runCliAnalysis({
          rootPath: dir,
          excludeTests: false,
          respectGitignore: true,
        });

        // Then the generated file should be excluded
        const uris = result.symbols.map(s => s.uri);
        const generatedUri = pathToFileURL(join(dir, 'generated', 'api.ts')).toString();
        const mainUri = pathToFileURL(join(dir, 'src', 'main.ts')).toString();
        expect(uris).toContain(mainUri);
        expect(uris).not.toContain(generatedUri);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('should succeed and include all files when respectGitignore is true but no .gitignore exists', async () => {
      // Given a project root with no .gitignore file
      const dir = await mkdtemp(join(tmpdir(), 'ddp-cli-missing-gitignore-'));
      try {
        await mkdir(join(dir, 'src'), { recursive: true });
        await writeFile(join(dir, 'src', 'main.ts'), 'export function main() { return 1; }\n');
        // Intentionally no .gitignore file

        // When I run CLI analysis with respectGitignore enabled
        const result = await runCliAnalysis({
          rootPath: dir,
          excludeTests: false,
          respectGitignore: true,
        });

        // Then analysis should complete successfully (nullFilter applied — no files excluded)
        const names = result.symbols.map(s => s.name);
        expect(names).toContain('main');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('should include all files when respectGitignore is false', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'ddp-cli-no-gitignore-'));
      try {
        await mkdir(join(dir, 'src'), { recursive: true });
        await mkdir(join(dir, 'generated'), { recursive: true });
        await writeFile(join(dir, '.gitignore'), 'generated/\n');
        await writeFile(join(dir, 'src', 'main.ts'), 'export function main() { return 1; }\n');
        await writeFile(join(dir, 'generated', 'api.ts'), 'export function callApi() { return 2; }\n');

        // When I run CLI analysis with respectGitignore disabled (default)
        const result = await runCliAnalysis({
          rootPath: dir,
          excludeTests: false,
          respectGitignore: false,
        });

        // Then both files should be included
        const names = result.symbols.map(s => s.name);
        expect(names).toContain('main');
        expect(names).toContain('callApi');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: Format analysis result as JSON', () => {
    it('should produce valid JSON with timestamp, summary, and files', async () => {
      // Given analysis has completed
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // When I format output as JSON
      const jsonStr = formatAnalysisAsJson(result, FIXTURE_PATH);
      const parsed: JsonOutput = JSON.parse(jsonStr);

      // Then the output should have all required top-level fields
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.summary.filesAnalyzed).toBeGreaterThan(0);
      expect(parsed.summary.symbolsAnalyzed).toBeGreaterThan(0);
      expect(parsed.files.length).toBeGreaterThan(0);
    });

    it('should include the "add" symbol in the JSON output with metrics', async () => {
      // Given analysis has completed on the fixture project
      const result = await runCliAnalysis({ rootPath: FIXTURE_PATH, excludeTests: false });

      // When I format output as JSON
      const jsonStr = formatAnalysisAsJson(result, FIXTURE_PATH);
      const parsed: JsonOutput = JSON.parse(jsonStr);

      // Then the "add" function should appear in a file entry with valid metrics
      const allSymbols = parsed.files.flatMap(f => f.symbols);
      const addSymbol = allSymbols.find(s => s.name === 'add');
      expect(addSymbol).toBeDefined();
      expect(addSymbol!.cc).toBeGreaterThanOrEqual(1);
      expect(addSymbol!.t).toBeGreaterThan(0);
      expect(Number.isFinite(addSymbol!.f)).toBe(true);
    });
  });
});
