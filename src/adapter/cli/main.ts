/**
 * CLI main entry point — testable function with injected I/O.
 *
 * Parses arguments, runs analysis, and writes formatted output.
 * All side effects (stdout, stderr, cwd) are injected for testability.
 */

import { writeFile } from 'node:fs/promises';
import { parseArgs } from './parseArgs';
import { runCliAnalysis } from './cliAnalysis';
import { formatAnalysisAsJson } from './formatJson';
import type { Logger } from '../../core/ports';

/** Hardcoded version literal — keep in sync with the "version" field in package.json. */
const VERSION = '0.1.0';

/** Output formats currently supported by this CLI. Extend when a new formatter is added. */
const SUPPORTED_FORMATS = ['json'] as const;
type SupportedFormat = typeof SUPPORTED_FORMATS[number];

/** Injected I/O context — avoids direct process globals for testability. */
export type CliContext = {
  readonly argv: string[];
  readonly stdout: { write(s: string): void };
  readonly stderr: { write(s: string): void };
  readonly cwd: string;
};

const HELP_TEXT = `Usage: ddp-analyze [options]

Analyze TypeScript/JavaScript source files for failure risk (F = R x CRAP).

Options:
  --root <path>       Project root directory (default: current directory)
  --output <file>     Write output to file instead of stdout
  --format <type>     Output format: json (default: json)
  --exclude-tests     Exclude test files from analysis (default)
  --no-exclude-tests  Include test files in analysis
  --verbose           Enable detailed logging to stderr
  --help              Show this help message
  --version           Show version number

Examples:
  ddp-analyze
  ddp-analyze --root ./my-project --output report.json
  ddp-analyze --format json --output report.json
`;

/**
 * Run the CLI. Returns a process exit code.
 */
export async function main(ctx: CliContext): Promise<number> {
  const opts = parseArgs(ctx.argv);

  if (opts.help) {
    ctx.stdout.write(HELP_TEXT);
    return 0;
  }

  if (opts.version) {
    ctx.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (!SUPPORTED_FORMATS.includes(opts.format as SupportedFormat)) {
    ctx.stderr.write(`Error: unsupported format '${opts.format}'. Supported formats: ${SUPPORTED_FORMATS.join(', ')}\n`);
    return 1;
  }

  const rootPath = opts.root ?? ctx.cwd;

  const logger: Logger = opts.verbose
    ? {
        info(msg: string) { ctx.stderr.write(`[INFO] ${msg}\n`); },
        warn(msg: string) { ctx.stderr.write(`[WARN] ${msg}\n`); },
        error(msg: string) { ctx.stderr.write(`[ERROR] ${msg}\n`); },
      }
    : {
        info() {},
        warn() {},
        error(msg: string) { ctx.stderr.write(`[ERROR] ${msg}\n`); },
      };

  try {
    const result = await runCliAnalysis({
      rootPath,
      excludeTests: opts.excludeTests,
      logger,
    });
    const json = formatAnalysisAsJson(result, rootPath);

    if (opts.output) {
      await writeFile(opts.output, json, 'utf-8');
    } else {
      ctx.stdout.write(json);
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}
