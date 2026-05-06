/**
 * CLI argument parser.
 *
 * Uses Node.js built-in `node:util parseArgs` for robust flag parsing.
 * Returns a typed options object consumed by the CLI main function.
 */

import { parseArgs as nodeParseArgs } from 'node:util';

/** Supported subcommands. */
export type CliCommand = 'analyze' | 'callers';

/** Parsed CLI options for the top-level (analyze) command. */
export type CliOptions = {
  /** Detected subcommand. */
  readonly command: CliCommand;
  /** Project root directory (defaults to cwd if undefined). */
  readonly root: string | undefined;
  /** Output file path (defaults to stdout if undefined). */
  readonly output: string | undefined;
  /** Output format. */
  readonly format: string;
  /** Respect .gitignore patterns when discovering files (default: false). */
  readonly respectGitignore: boolean;
  /**
   * True when the user explicitly typed `--respect-gitignore` or `--no-respect-gitignore`.
   * Distinguishes "user-set" from "parser-default" so resolveAnalysisOptions can
   * defer to .ddprc.json when the flag was not set.
   */
  readonly respectGitignoreExplicit: boolean;
  /** Glob patterns to exclude from analysis (repeatable). */
  readonly excludePatterns: readonly string[];
  /** Skip call graph computation (default: false). When true, all R=1. */
  readonly skipCallGraph: boolean;
  /** Enable verbose logging. */
  readonly verbose: boolean;
  /**
   * True when the user explicitly typed `--verbose` or `--no-verbose`.
   * Distinguishes user-set from parser-default so resolveAnalysisOptions can
   * defer to `.ddprc.json`'s `debug` field when the flag was not set.
   */
  readonly verboseExplicit: boolean;
  /** Show help and exit. */
  readonly help: boolean;
  /** Show version and exit. */
  readonly version: boolean;
};

/** Parsed CLI options for the `callers` subcommand. */
export type CallersOptions = {
  /** Project root directory (defaults to cwd if undefined). */
  readonly root: string | undefined;
  /** Source file containing the target symbol. */
  readonly file: string | undefined;
  /** Symbol name to look up callers for. */
  readonly symbol: string | undefined;
  /** Max depth for caller tree traversal (default: 5). */
  readonly depth: number;
  /** Output format: json or text (default: json). */
  readonly format: string;
  /** Respect .gitignore patterns when discovering files (default: false). */
  readonly respectGitignore: boolean;
  /** True when --respect-gitignore or --no-respect-gitignore was set explicitly. */
  readonly respectGitignoreExplicit: boolean;
  /** Glob patterns to exclude from analysis (repeatable). */
  readonly excludePatterns: readonly string[];
  /** Enable verbose logging. */
  readonly verbose: boolean;
  /** True when --verbose or --no-verbose was set explicitly. */
  readonly verboseExplicit: boolean;
};

// ── Shared option config for node:util parseArgs ────────────────────────────

const commonOptions = {
  root: { type: 'string' as const },
  format: { type: 'string' as const },
  'respect-gitignore': { type: 'boolean' as const },
  'call-graph': { type: 'boolean' as const },
  verbose: { type: 'boolean' as const },
};

// ── parseArgs ───────────────────────────────────────────────────────────────

/**
 * Parse process.argv-style array into CLI options.
 * Expects argv[0] = node, argv[1] = script, argv[2..] = user flags.
 */
export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2); // skip node + script

  // Detect subcommand: first non-flag argument
  let command: CliCommand = 'analyze';
  let startIndex = 0;
  if (args.length > 0 && args[0] === 'callers') {
    command = 'callers';
    startIndex = 1;
  }

  const { values, tokens } = nodeParseArgs({
    args: args.slice(startIndex) as string[],
    options: {
      ...commonOptions,
      output: { type: 'string' },
      exclude: { type: 'string', multiple: true },
      help: { type: 'boolean' },
      version: { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  return {
    command,
    root: stringOrUndefined(values.root),
    output: stringOrUndefined(values.output),
    format: stringOrUndefined(values.format) ?? 'json',
    respectGitignore: lastWinsNegatable(tokens, 'respect-gitignore', false),
    respectGitignoreExplicit: hasNegatable(tokens, 'respect-gitignore'),
    excludePatterns: (values.exclude as string[] | undefined) ?? [],
    skipCallGraph: !lastWinsNegatable(tokens, 'call-graph', true),
    verbose: lastWinsNegatable(tokens, 'verbose', false),
    verboseExplicit: hasNegatable(tokens, 'verbose'),
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

// ── parseCallersArgs ────────────────────────────────────────────────────────

/**
 * Parse process.argv-style array into callers subcommand options.
 * Expects argv[2] = "callers", argv[3..] = callers-specific flags.
 */
export function parseCallersArgs(argv: readonly string[]): CallersOptions {
  const args = argv.slice(2); // skip node + script

  // Skip the "callers" subcommand token
  const startIndex = args[0] === 'callers' ? 1 : 0;

  const { values, tokens } = nodeParseArgs({
    args: args.slice(startIndex) as string[],
    options: {
      ...commonOptions,
      file: { type: 'string' },
      symbol: { type: 'string' },
      depth: { type: 'string' }, // parsed as string, validated below
      exclude: { type: 'string', multiple: true },
    },
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  let depth = 5;
  if (values.depth !== undefined) {
    const parsed = parseInt(values.depth as string, 10);
    if (Number.isFinite(parsed) && parsed > 0) depth = parsed;
  }

  return {
    root: stringOrUndefined(values.root),
    file: stringOrUndefined(values.file),
    symbol: stringOrUndefined(values.symbol),
    depth,
    format: stringOrUndefined(values.format) ?? 'json',
    respectGitignore: lastWinsNegatable(tokens, 'respect-gitignore', false),
    respectGitignoreExplicit: hasNegatable(tokens, 'respect-gitignore'),
    excludePatterns: (values.exclude as string[] | undefined) ?? [],
    verbose: lastWinsNegatable(tokens, 'verbose', false),
    verboseExplicit: hasNegatable(tokens, 'verbose'),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract string value, returning undefined if node:util set it to boolean (missing value case). */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

type Token = { kind: string; name?: string };

/**
 * Resolve a negatable boolean flag from tokens (last occurrence wins).
 * Looks for `--<name>` (true) and `--no-<name>` (false) in parse order.
 */
function lastWinsNegatable(tokens: Token[], name: string, defaultValue: boolean): boolean {
  const negName = `no-${name}`;
  let result = defaultValue;
  for (const token of tokens) {
    if (token.kind === 'option') {
      if (token.name === name) result = true;
      else if (token.name === negName) result = false;
    }
  }
  return result;
}

/**
 * True iff `--<name>` or `--no-<name>` appears anywhere in the parsed tokens.
 * Used to distinguish "user explicitly set the flag" from "parser default".
 */
function hasNegatable(tokens: Token[], name: string): boolean {
  const negName = `no-${name}`;
  return tokens.some((t) => t.kind === 'option' && (t.name === name || t.name === negName));
}
