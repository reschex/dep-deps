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

  describe('Scenario: Skip call graph computation', () => {
    it('should default skipCallGraph to false', () => {
      const result = parseArgs(['node', 'ddp-analyze']);

      expect(result.skipCallGraph).toBe(false);
    });

    it('should parse --no-call-graph flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--no-call-graph']);

      expect(result.skipCallGraph).toBe(true);
    });

    it('should parse --call-graph flag (explicit enable)', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--call-graph']);

      expect(result.skipCallGraph).toBe(false);
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

  describe('Scenario: Respect gitignore flag', () => {
    it('should default respectGitignore to false', () => {
      const result = parseArgs(['node', 'ddp-analyze']);

      expect(result.respectGitignore).toBe(false);
    });

    it('should parse --respect-gitignore flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--respect-gitignore']);

      expect(result.respectGitignore).toBe(true);
    });

    it('should parse --no-respect-gitignore flag', () => {
      const result = parseArgs(['node', 'ddp-analyze', '--no-respect-gitignore']);

      expect(result.respectGitignore).toBe(false);
    });
  });

  describe('Scenario: Value flag where next arg looks like a flag', () => {
    it('consumes --verbose as the root value when --root --verbose is given', () => {
      const result = parseArgs(['node', 'ddp', '--root', '--verbose']);

      // --verbose is consumed as the value of --root (no look-ahead for "--" prefix)
      expect(result.root).toBe('--verbose');
      expect(result.verbose).toBe(false);
    });

    it('consumes --help as the output value when --output --help is given', () => {
      const result = parseArgs(['node', 'ddp', '--output', '--help']);

      expect(result.output).toBe('--help');
      expect(result.help).toBe(false);
    });

    it('consumes --version as the format value when --format --version is given', () => {
      const result = parseArgs(['node', 'ddp', '--format', '--version']);

      expect(result.format).toBe('--version');
      expect(result.version).toBe(false);
    });
  });

  describe('Scenario: Empty string as flag value', () => {
    it('accepts empty string as --root value', () => {
      const result = parseArgs(['node', 'ddp', '--root', '']);

      expect(result.root).toBe('');
    });

    it('accepts empty string as --output value', () => {
      const result = parseArgs(['node', 'ddp', '--output', '']);

      expect(result.output).toBe('');
    });

    it('accepts empty string as --format value', () => {
      const result = parseArgs(['node', 'ddp', '--format', '']);

      expect(result.format).toBe('');
    });
  });

  describe('Scenario: Flag values with special characters', () => {
    it('accepts path with spaces as --root value', () => {
      const result = parseArgs(['node', 'ddp', '--root', '/path/to/my project']);

      expect(result.root).toBe('/path/to/my project');
    });

    it('accepts unicode path as --root value', () => {
      const result = parseArgs(['node', 'ddp', '--root', '/home/用户/проект']);

      expect(result.root).toBe('/home/用户/проект');
    });

    it('accepts Windows path with backslashes as --root value', () => {
      const result = parseArgs(['node', 'ddp', '--root', 'C:\\Users\\dev\\project']);

      expect(result.root).toBe('C:\\Users\\dev\\project');
    });

    it('accepts path with special chars as --output value', () => {
      const result = parseArgs(['node', 'ddp', '--output', './out put (1).json']);

      expect(result.output).toBe('./out put (1).json');
    });
  });

  describe('Scenario: Conflicting boolean flags (last wins)', () => {
    it('returns excludeTests=false when --exclude-tests followed by --no-exclude-tests', () => {
      const result = parseArgs(['node', 'ddp', '--exclude-tests', '--no-exclude-tests']);

      expect(result.excludeTests).toBe(false);
    });

    it('returns excludeTests=true when --no-exclude-tests followed by --exclude-tests', () => {
      const result = parseArgs(['node', 'ddp', '--no-exclude-tests', '--exclude-tests']);

      expect(result.excludeTests).toBe(true);
    });

    it('returns respectGitignore=false when --respect-gitignore followed by --no-respect-gitignore', () => {
      const result = parseArgs(['node', 'ddp', '--respect-gitignore', '--no-respect-gitignore']);

      expect(result.respectGitignore).toBe(false);
    });
  });

  describe('Scenario: Positional/non-flag tokens are silently ignored', () => {
    it('ignores bare words that are not subcommands', () => {
      const result = parseArgs(['node', 'ddp', 'analyze', 'extra-positional']);

      expect(result.command).toBe('analyze');
      expect(result.root).toBeUndefined();
      expect(result.format).toBe('json');
    });

    it('ignores positional args between flags', () => {
      const result = parseArgs(['node', 'ddp', '--verbose', 'stray-arg', '--root', '/foo']);

      expect(result.verbose).toBe(true);
      expect(result.root).toBe('/foo');
    });

    it('does not treat "analyze" as subcommand (only "callers" is checked)', () => {
      const result = parseArgs(['node', 'ddp', 'analyze', '--verbose']);

      // "analyze" is not consumed as a subcommand — it's silently ignored as unknown
      expect(result.command).toBe('analyze');
      expect(result.verbose).toBe(true);
    });
  });

  describe('Scenario: Equals-sign syntax is supported', () => {
    it('parses --root=/path correctly', () => {
      const result = parseArgs(['node', 'ddp', '--root=/path/to/project']);

      expect(result.root).toBe('/path/to/project');
    });

    it('parses --format=github-summary correctly', () => {
      const result = parseArgs(['node', 'ddp', '--format=github-summary']);

      expect(result.format).toBe('github-summary');
    });
  });

  describe('Scenario: Very long argv arrays', () => {
    it('handles 100 unknown flags without error', () => {
      const manyFlags = Array.from({ length: 100 }, (_, i) => `--flag-${i}`);
      const result = parseArgs(['node', 'ddp', ...manyFlags]);

      expect(result.command).toBe('analyze');
      expect(result.format).toBe('json');
    });

    it('picks up last --root among many repeated flags', () => {
      const repeated = Array.from({ length: 50 }, () => ['--root', '/overwritten']).flat();
      const result = parseArgs(['node', 'ddp', ...repeated, '--root', '/final']);

      expect(result.root).toBe('/final');
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

    it('should parse --respect-gitignore flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn', '--respect-gitignore']);

      expect(result.respectGitignore).toBe(true);
    });

    it('should default respectGitignore to false', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file', 'f.ts', '--symbol', 'fn']);

      expect(result.respectGitignore).toBe(false);
    });

    it('should parse --exclude-tests flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--exclude-tests']);

      expect(result.excludeTests).toBe(true);
    });

    it('should parse --no-exclude-tests flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--no-exclude-tests']);

      expect(result.excludeTests).toBe(false);
    });

    it('should default excludeTests to true', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers']);

      expect(result.excludeTests).toBe(true);
    });

    it('should parse --no-respect-gitignore flag', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--no-respect-gitignore']);

      expect(result.respectGitignore).toBe(false);
    });
  });

  describe('Scenario: Missing values for callers value flags (last arg)', () => {
    it('leaves file undefined when --file is last arg with no value', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--file']);

      expect(result.file).toBeUndefined();
    });

    it('leaves symbol undefined when --symbol is last arg with no value', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--symbol']);

      expect(result.symbol).toBeUndefined();
    });

    it('keeps default depth when --depth is last arg with no value', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth']);

      expect(result.depth).toBe(5);
    });
  });

  describe('Scenario: --depth numeric edge cases', () => {
    it('truncates float to integer when --depth is 3.7', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', '3.7']);

      expect(result.depth).toBe(3);
    });

    it('accepts very large depth value', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', '999999999']);

      expect(result.depth).toBe(999999999);
    });

    it('keeps default depth when --depth is NaN string', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', 'NaN']);

      expect(result.depth).toBe(5);
    });

    it('keeps default depth when --depth is Infinity string', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', 'Infinity']);

      expect(result.depth).toBe(5);
    });

    it('keeps default depth when --depth is -0', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', '-0']);

      expect(result.depth).toBe(5);
    });

    it('accepts depth of 1 (minimum valid)', () => {
      const result = parseCallersArgs(['node', 'ddp', 'callers', '--depth', '1']);

      expect(result.depth).toBe(1);
    });
  });
});
