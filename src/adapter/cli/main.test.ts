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
import { main } from './main';
import type { JsonOutput } from './formatJson';

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
});
