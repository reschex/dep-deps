/**
 * CLI argument parser.
 *
 * Minimal hand-rolled parser — no external dependency needed for the MVP flag set.
 * Returns a typed options object consumed by the CLI main function.
 */

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
  /** Exclude test files from analysis (default: true). */
  readonly excludeTests: boolean;
  /** Respect .gitignore patterns when discovering files (default: false). */
  readonly respectGitignore: boolean;
  /** Enable verbose logging. */
  readonly verbose: boolean;
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
  /** Exclude test files from analysis (default: true). */
  readonly excludeTests: boolean;
  /** Respect .gitignore patterns when discovering files (default: false). */
  readonly respectGitignore: boolean;
  /** Enable verbose logging. */
  readonly verbose: boolean;
};

// ── Shared flag state ───────────────────────────────────────────────────────

type CommonFlagState = {
  root: string | undefined;
  format: string;
  excludeTests: boolean;
  respectGitignore: boolean;
  verbose: boolean;
};

/**
 * Attempt to consume a common flag (shared by all subcommands).
 * Mutates `state` in place and returns the potentially-advanced index.
 * Returns the original index if the flag was not recognised.
 */
function applyCommonFlag(
  arg: string,
  args: readonly string[],
  i: number,
  state: CommonFlagState,
): number {
  switch (arg) {
    case '--root':
      if (i + 1 < args.length) { state.root = args[i + 1]; return i + 1; }
      break;
    case '--format':
      if (i + 1 < args.length) { state.format = args[i + 1]; return i + 1; }
      break;
    case '--exclude-tests':
      state.excludeTests = true;
      break;
    case '--no-exclude-tests':
      state.excludeTests = false;
      break;
    case '--respect-gitignore':
      state.respectGitignore = true;
      break;
    case '--no-respect-gitignore':
      state.respectGitignore = false;
      break;
    case '--verbose':
      state.verbose = true;
      break;
  }
  return i;
}

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

  let output: string | undefined;
  let help = false;
  let version = false;
  const common: CommonFlagState = { root: undefined, format: 'json', excludeTests: true, respectGitignore: false, verbose: false };

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    const advanced = applyCommonFlag(arg, args, i, common);
    if (advanced !== i) { i = advanced; continue; }

    switch (arg) {
      case '--output':
        if (i + 1 < args.length) output = args[++i];
        break;
      case '--help':
        help = true;
        break;
      case '--version':
        version = true;
        break;
    }
  }

  return { command, root: common.root, output, format: common.format, excludeTests: common.excludeTests, respectGitignore: common.respectGitignore, verbose: common.verbose, help, version };
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

  let file: string | undefined;
  let symbol: string | undefined;
  let depth = 5;
  const common: CommonFlagState = { root: undefined, format: 'json', excludeTests: true, respectGitignore: false, verbose: false };

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    const advanced = applyCommonFlag(arg, args, i, common);
    if (advanced !== i) { i = advanced; continue; }

    switch (arg) {
      case '--file':
        if (i + 1 < args.length) file = args[++i];
        break;
      case '--symbol':
        if (i + 1 < args.length) symbol = args[++i];
        break;
      case '--depth': {
        if (i + 1 < args.length) {
          const parsed = parseInt(args[++i], 10);
          if (Number.isFinite(parsed) && parsed > 0) depth = parsed;
        }
        break;
      }
    }
  }

  return { root: common.root, file, symbol, depth, format: common.format, excludeTests: common.excludeTests, respectGitignore: common.respectGitignore, verbose: common.verbose };
}
