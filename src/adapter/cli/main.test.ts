/**
 * Tests for CLI main entry point.
 *
 * Scenario: Run analysis with default options
 * From: features/cli-command-interface.feature
 *
 * The main() function is tested with injected I/O (stdout, stderr, cwd)
 * so we use real code without spawning subprocesses.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { main, findSymbol } from './main';
import type { JsonOutput } from './formatJson';
import { sym } from '../../core/testFixtures';

const FIXTURE_PATH = join(__dirname, '../../test/fixtures/cli/simple-project');

/** Capture writes to a fake writable stream. */
function captureStream(): { write(s: string): void; output: string } {
  const buf: string[] = [];
  return {
    write(s: string) { buf.push(s); },
    get output() { return buf.join(''); },
  };
}

describe('CLI main()', () => {
  describe('Scenario: Run analysis with default options', () => {
    it('should return exit code 0 on success', async () => {
      // Given a TypeScript project with source files and coverage data
      const stdout = captureStream();
      const stderr = captureStream();

      // When I run the CLI with --root pointing to the fixture
      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then the exit code should be 0
      expect(exitCode).toBe(0);
    });

    it('should write valid JSON to stdout', async () => {
      // Given a TypeScript project with source files
      const stdout = captureStream();
      const stderr = captureStream();

      // When I run the CLI
      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then JSON output should be written to stdout
      expect(exitCode).toBe(0);
      const parsed: JsonOutput = JSON.parse(stdout.output);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.files).toBeDefined();
    });

    it('should include symbols in the JSON output', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      const parsed: JsonOutput = JSON.parse(stdout.output);
      expect(parsed.summary.symbolsAnalyzed).toBeGreaterThan(0);

      // The "add" function from utils.ts should appear
      const allSymbols = parsed.files.flatMap(f => f.symbols);
      const addSymbol = allSymbols.find(s => s.name === 'add');
      expect(addSymbol).toBeDefined();
    });
  });

  describe('Scenario: Display help information', () => {
    it('should write help to stdout and return 0', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--help'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      expect(stdout.output).toContain('Usage');
      expect(stdout.output).toContain('--root');
      expect(stdout.output).toContain('--output');
      expect(stdout.output).toContain('--format');
    });
  });

  describe('Scenario: Display version information', () => {
    it('should write version to stdout and return 0', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--version'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      // Should contain a semver-like version string
      expect(stdout.output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Scenario: Reject unsupported output format', () => {
    it('should return exit code 1 when an unsupported format is specified', async () => {
      // Given an unsupported format
      const stdout = captureStream();
      const stderr = captureStream();

      // When I run the CLI with --format github-summary (not yet implemented)
      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--format', 'github-summary'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then the CLI should exit with code 1
      expect(exitCode).toBe(1);
      // And an error message should identify the unsupported format
      expect(stderr.output).toContain('unsupported format');
      // And nothing should be written to stdout
      expect(stdout.output).toBe('');
    });
  });

  describe('Scenario: Enable verbose logging', () => {
    it('should write log messages to stderr when --verbose is set', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests', '--verbose'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      // Verbose mode should produce INFO messages on stderr
      expect(stderr.output).toContain('[INFO]');
    });

    it('should write DEBUG file discovery messages to stderr when --verbose is set', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests', '--verbose'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      // Verbose mode should produce DEBUG messages listing discovered files
      expect(stderr.output).toContain('[DEBUG]');
      expect(stderr.output).toContain('Discovered');
      expect(stderr.output).toContain('file:///');
    });

    it('should NOT write log messages to stderr without --verbose', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      // Without verbose, no INFO messages should appear
      expect(stderr.output).not.toContain('[INFO]');
    });
  });

  describe('Scenario: Unwritable output path', () => {
    it('should return exit code 1 and write to stderr when the output file cannot be created', async () => {
      // Given an output path whose parent directory does not exist
      const stdout = captureStream();
      const stderr = captureStream();
      const badOutputPath = join(tmpdir(), 'ddp-does-not-exist-dir', 'output.json');

      // When I run the CLI targeting that path
      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests', '--output', badOutputPath],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then the exit code should be 1
      expect(exitCode).toBe(1);
      // And an error message should appear on stderr
      expect(stderr.output).toContain('Error:');
      // And nothing should be written to stdout
      expect(stdout.output).toBe('');
    });
  });

  describe('Scenario: Specify output file', () => {
    const outputFile = join(tmpdir(), `ddp-test-output-${Date.now()}.json`);

    afterEach(async () => {
      await rm(outputFile, { force: true });
    });

    it('should write JSON to the specified file and return 0', async () => {
      // Given a project with source files
      const stdout = captureStream();
      const stderr = captureStream();

      // When I run ddp-analyze --output <file>
      const exitCode = await main({
        argv: ['node', 'ddp-analyze', '--root', FIXTURE_PATH, '--no-exclude-tests', '--output', outputFile],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then the analysis should complete successfully
      expect(exitCode).toBe(0);

      // And the file should be created with valid JSON
      const content = await readFile(outputFile, 'utf-8');
      const parsed: JsonOutput = JSON.parse(content);
      expect(parsed.summary.symbolsAnalyzed).toBeGreaterThan(0);

      // And stdout should NOT contain the JSON (it went to the file)
      expect(stdout.output).toBe('');
    });
  });

  describe('Scenario: Callers subcommand requires --file and --symbol', () => {
    it('should return exit code 1 when --file is missing', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--symbol', 'add'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(1);
      expect(stderr.output).toContain('--file');
    });

    it('should return exit code 1 when --symbol is missing', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--file', 'src/utils.ts'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(1);
      expect(stderr.output).toContain('--symbol');
    });
  });

  describe('Scenario: Callers subcommand with valid symbol', () => {
    it('should return exit code 0 and produce JSON output', async () => {
      // Given the fixture project with an "add" function in utils.ts
      const stdout = captureStream();
      const stderr = captureStream();

      // When I run the callers subcommand targeting "add"
      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--root', FIXTURE_PATH, '--file', 'src/utils.ts', '--symbol', 'add', '--format', 'json', '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      // Then the CLI should succeed
      expect(exitCode).toBe(0);

      // And output should be valid JSON with the CallersResult schema
      const parsed = JSON.parse(stdout.output);
      expect(parsed.symbol).toBe('add');
      expect(parsed.file).toContain('utils.ts');
      // riskLevel must be one of the four defined values
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(parsed.riskLevel);
      // impactSummary must have numeric counts
      expect(typeof parsed.impactSummary.directCallers).toBe('number');
      expect(typeof parsed.impactSummary.totalAffected).toBe('number');
      // callerTree must be an array (possibly empty if no callers in fixture)
      expect(Array.isArray(parsed.callerTree)).toBe(true);
    });

    it('should produce text output when --format text is specified', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--root', FIXTURE_PATH, '--file', 'src/utils.ts', '--symbol', 'add', '--format', 'text', '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(0);
      expect(stdout.output).toContain('IMPACT TREE: add');
      expect(stdout.output).toContain('Risk:');
    });
  });

  describe('Scenario: Callers subcommand with unknown symbol', () => {
    it('should return exit code 1 when symbol not found in analysis', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--root', FIXTURE_PATH, '--file', 'src/utils.ts', '--symbol', 'nonExistentFn', '--no-exclude-tests'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(1);
      expect(stderr.output).toContain('not found');
    });
  });

  describe('Scenario: Callers subcommand rejects unsupported format', () => {
    it('should return exit code 1 for an unsupported format', async () => {
      const stdout = captureStream();
      const stderr = captureStream();

      const exitCode = await main({
        argv: ['node', 'ddp', 'callers', '--root', FIXTURE_PATH, '--file', 'src/utils.ts', '--symbol', 'add', '--format', 'xml'],
        stdout,
        stderr,
        cwd: FIXTURE_PATH,
      });

      expect(exitCode).toBe(1);
      expect(stderr.output).toContain('unsupported format');
    });
  });
});

describe('findSymbol', () => {
  describe('Scenario: Exact path match is preferred over substring match', () => {
    it('returns the symbol whose URI ends with the given file path', () => {
      const symbols = [
        sym({ id: 'A', name: 'add', uri: 'file:///proj/src/utils.ts' }),
      ];

      const result = findSymbol(symbols, 'src/utils.ts', 'add');

      expect(result?.id).toBe('A');
    });

    it('does not match a symbol whose filename contains the target as a non-boundary substring', () => {
      // "utils.ts" is a substring of "myutils.ts" but not at a path boundary — must NOT match
      const symbols = [
        sym({ id: 'A', name: 'add', uri: 'file:///proj/src/myutils.ts' }),
      ];

      const result = findSymbol(symbols, 'utils.ts', 'add');

      expect(result).toBeUndefined();
    });

    it('returns the exact-match symbol when a longer filename also contains the target as a substring', () => {
      // Order: the false-positive candidate first — must NOT be selected
      const symbols = [
        sym({ id: 'bad', name: 'add', uri: 'file:///proj/src/myutils.ts' }),
        sym({ id: 'good', name: 'add', uri: 'file:///proj/src/utils.ts' }),
      ];

      const result = findSymbol(symbols, 'utils.ts', 'add');

      expect(result?.id).toBe('good');
    });

    it('normalises backslashes for Windows paths', () => {
      const symbols = [
        sym({ id: 'A', name: 'fn', uri: 'file:///proj\\src\\utils.ts' }),
      ];

      const result = findSymbol(symbols, 'src/utils.ts', 'fn');

      expect(result?.id).toBe('A');
    });

    it('returns undefined when no symbol matches by name', () => {
      const symbols = [
        sym({ id: 'A', name: 'add', uri: 'file:///proj/src/utils.ts' }),
      ];

      const result = findSymbol(symbols, 'src/utils.ts', 'subtract');

      expect(result).toBeUndefined();
    });
  });
});
