/**
 * Tests for CLI argument parsing.
 *
 * Scenario: Run analysis with default options
 * Scenario: Specify custom root directory
 * Scenario: Specify output file
 * From: features/cli-command-interface.feature
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, parseCallersArgs } from './parseArgs';

describe('parseArgs', () => {
  describe('Scenario: default options when no flags provided', () => {
    it('should return defaults when argv is empty', () => {
      // Given no arguments beyond the node/script prefix
      const result = parseArgs(['node', 'ddp-analyze']);

      // Then root should be undefined (caller uses cwd)
      expect(result.root).toBeUndefined();
      // And format should default to "json"
      expect(result.format).toBe('json');
      // And output should be undefined (write to stdout)
      expect(result.output).toBeUndefined();
      // And verbose should be false
      expect(result.verbose).toBe(false);
      // And help should be false
      expect(result.help).toBe(false);
      // And version should be false
      expect(result.version).toBe(false);
    });
  });

  describe('Scenario: Specify custom root directory', () => {
    it('should parse --root flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--root', '/path/to/project']);

      expect(result.root).toBe('/path/to/project');
    });
  });

  describe('Scenario: Specify output file', () => {
    it('should parse --output flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--output', 'analysis.json']);

      expect(result.output).toBe('analysis.json');
    });
  });

  describe('Scenario: Enable verbose logging', () => {
    it('should parse --verbose flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--verbose']);

      expect(result.verbose).toBe(true);
    });
  });

  describe('Scenario: Display help information', () => {
    it('should parse --help flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--help']);

      expect(result.help).toBe(true);
    });
  });

  describe('Scenario: Display version information', () => {
    it('should parse --version flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--version']);

      expect(result.version).toBe(true);
    });
  });

  describe('Scenario: Specify format', () => {
    it('should parse --format json', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--format', 'json']);

      expect(result.format).toBe('json');
    });

    it('should parse --format github-summary', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--format', 'github-summary']);

      expect(result.format).toBe('github-summary');
    });
  });

  describe('Scenario: Exclude test files by default', () => {
    it('should default excludeTests to true', () => {
      const result = parseArgs(['node', 'ddp-analyze']);

      expect(result.excludeTests).toBe(true);
    });

    it('should parse --exclude-tests flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--exclude-tests']);

      expect(result.excludeTests).toBe(true);
    });
  });

  describe('Scenario: Include test files when requested', () => {
    it('should parse --no-exclude-tests flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--no-exclude-tests']);

      expect(result.excludeTests).toBe(false);
    });
  });

  describe('Scenario: Value flags with missing value (no argument follows the flag)', () => {
    it('should keep default format when --format has no following value', () => {
      // Given --format is the last argument with nothing after it
      const result = parseArgs(['node', 'ddp-analyze', '--format']);

      // Then format should fall back to the default ('json'), not become undefined
      expect(result.format).toBe('json');
    });

    it('should keep root as undefined when --root has no following value', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--root']);

      expect(result.root).toBeUndefined();
    });

    it('should keep output as undefined when --output has no following value', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--output']);

      expect(result.output).toBeUndefined();
    });
  });

  describe('Scenario: Unknown flags are silently ignored', () => {
    it('should return defaults when an unrecognised flag is provided', () => {
      // Documents that parseArgs is permissive — semantic validation lives in main()
      const result = parseArgs(['node', 'ddp-analyze', '--unknown-flag']);

      expect(result.root).toBeUndefined();
      expect(result.format).toBe('json');
      expect(result.verbose).toBe(false);
    });
  });

  describe('Scenario: Unknown format string is preserved for caller validation', () => {
    it('should return the raw string for --format with an unrecognised value', () => {
      // parseArgs is a dumb tokeniser; semantic validation (rejecting bad formats)
      // is main()'s responsibility — see main.test.ts "Reject unsupported output format"
      const result = parseArgs(['node', 'ddp-analyze', '--format', 'xml']);

      expect(result.format).toBe('xml');
    });
  });

  describe('Scenario: Multiple flags combined', () => {
    it('should parse all flags together', () => {
      const result = parseArgs([
        'node', 'ddp-analyze',
        '--root', '/my/project',
        '--output', 'out.json',
        '--format', 'json',
        '--no-exclude-tests',
        '--verbose',
      ]);

      expect(result.root).toBe('/my/project');
      expect(result.output).toBe('out.json');
      expect(result.format).toBe('json');
      expect(result.excludeTests).toBe(false);
      expect(result.verbose).toBe(true);
    });
  });

  describe('Scenario: Detect callers subcommand', () => {
    it('should set command to "callers" when first user arg is "callers"', () => {
      const result = parseArgs(['node', 'ddp', 'callers', '--file', 'src/foo.ts', '--symbol', 'doStuff']);

      expect(result.command).toBe('callers');
    });

    it('should default command to "analyze" when no subcommand given', () => {
      const result = parseArgs(['node', 'ddp']);

      expect(result.command).toBe('analyze');
    });

    it('should default command to "analyze" when first user arg is a flag', () => {
      const result = parseArgs(['node', 'ddp', '--root', '/foo']);

      expect(result.command).toBe('analyze');
    });
  });
});

describe('parseCallersArgs', () => {
  describe('Scenario: Parse callers subcommand flags', () => {
    it('should parse --file and --symbol flags', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'src/orders.ts', '--symbol', 'processOrder']);

      expect(result.file).toBe('src/orders.ts');
      expect(result.symbol).toBe('processOrder');
    });

    it('should parse --depth flag with numeric value', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'src/a.ts', '--symbol', 'fn', '--depth', '3']);

      expect(result.depth).toBe(3);
    });

    it('should default depth to 5 when not specified', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'src/a.ts', '--symbol', 'fn']);

      expect(result.depth).toBe(5);
    });

    it('should parse --format flag (json or text)', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--format', 'text']);

      expect(result.format).toBe('text');
    });

    it('should default format to json', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn']);

      expect(result.format).toBe('json');
    });

    it('should parse --root flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--root', '/proj', '--file', 'f.ts', '--symbol', 'fn']);

      expect(result.root).toBe('/proj');
    });

    it('should parse --verbose flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--verbose']);

      expect(result.verbose).toBe(true);
    });

    it('should leave file and symbol undefined when not specified', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers']);

      expect(result.file).toBeUndefined();
      expect(result.symbol).toBeUndefined();
    });

    it('should default depth to 5 when --depth value is non-numeric', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--depth', 'foo']);

      expect(result.depth).toBe(5);
    });

    it('should default depth to 5 when --depth value is zero', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--depth', '0']);

      expect(result.depth).toBe(5);
    });

    it('should default depth to 5 when --depth value is negative', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--depth', '-1']);

      expect(result.depth).toBe(5);
    });
  });
});
