/**
 * CLI argument parser.
 *
 * Minimal hand-rolled parser — no external dependency needed for the MVP flag set.
 * Returns a typed options object consumed by the CLI main function.
 */

/** Parsed CLI options. */
export type CliOptions = {
  /** Project root directory (defaults to cwd if undefined). */
  readonly root: string | undefined;
  /** Output file path (defaults to stdout if undefined). */
  readonly output: string | undefined;
  /** Output format. */
  readonly format: string;
  /** Exclude test files from analysis (default: true). */
  readonly excludeTests: boolean;
  /** Enable verbose logging. */
  readonly verbose: boolean;
  /** Show help and exit. */
  readonly help: boolean;
  /** Show version and exit. */
  readonly version: boolean;
};

/**
 * Parse process.argv-style array into CLI options.
 * Expects argv[0] = node, argv[1] = script, argv[2..] = user flags.
 */
export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2); // skip node + script

  let root: string | undefined;
  let output: string | undefined;
  let format = 'json';
  let excludeTests = true;
  let verbose = false;
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--root':
        if (i + 1 < args.length) root = args[++i];
        break;
      case '--output':
        if (i + 1 < args.length) output = args[++i];
        break;
      case '--format':
        if (i + 1 < args.length) format = args[++i];
        break;
      case '--exclude-tests':
        excludeTests = true;
        break;
      case '--no-exclude-tests':
        excludeTests = false;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--help':
        help = true;
        break;
      case '--version':
        version = true;
        break;
    }
  }

  return { root, output, format, excludeTests, verbose, help, version };
}
