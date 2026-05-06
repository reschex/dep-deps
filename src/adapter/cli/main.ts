/**
 * CLI main entry point — testable function with injected I/O.
 *
 * Parses arguments, runs analysis, and writes formatted output.
 * All side effects (stdout, stderr, cwd) are injected for testability.
 */

import { writeFile } from 'node:fs/promises';
import { parseArgs, parseCallersArgs } from './parseArgs';
import { runCliAnalysis, type CliAnalysisOptions } from './cliAnalysis';
import { resolveAnalysisOptions, type ResolvableOptions } from './resolveOptions';
import { formatAnalysisAsJson } from './formatJson';
import { callerTree, impactSummary } from '../../core/callerTree';
import { classifyRisk } from '../../core/riskLevel';
import { loadDdpConfig } from '../../core/config';
import { formatImpactTreeText, formatImpactTreeJson, type CallersResult } from '../../core/formatImpactTree';
import type { AnalysisResult } from '../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../core/analyze';
import type { Logger } from '../../core/ports';
import { findSymbol } from '../../shared/symbolSearch';

/** Hardcoded version literal — keep in sync with the "version" field in package.json. */
const VERSION = '0.1.0';

/** Output formats supported by the `analyze` command. */
const ANALYZE_FORMATS = ['json'] as const;
type AnalyzeFormat = typeof ANALYZE_FORMATS[number];

/** Output formats supported by the `callers` command. */
const CALLERS_FORMATS = ['json', 'text'] as const;
type CallersFormat = typeof CALLERS_FORMATS[number];

/** Injected I/O context — avoids direct process globals for testability. */
export type CliContext = {
  readonly argv: string[];
  readonly stdout: { write(s: string): void };
  readonly stderr: { write(s: string): void };
  readonly cwd: string;
};

const HELP_TEXT = `Usage: ddp [command] [options]

Analyze TypeScript/JavaScript source files for failure risk (F = R x CRAP).

Commands:
  analyze             Run full analysis (default)
  callers             Show caller tree for a symbol

Analyze Options:
  --root <path>           Project root directory (default: current directory)
  --output <file>         Write output to file instead of stdout
  --format <type>         Output format: json (default: json)
  --respect-gitignore     Exclude files matched by .gitignore
  --no-respect-gitignore  Include .gitignore-matched files (default)
  --exclude <glob>        Exclude files matching glob pattern (repeatable, opt-in;
                          no patterns by default — test files ARE analyzed unless excluded).
                          Examples: --exclude '**/*.test.*' --exclude '**/__tests__/**'
  --no-call-graph         Skip call graph computation (all R=1, faster)
  --verbose               Enable detailed logging to stderr
  --no-verbose            Disable detailed logging (overrides "debug": true in .ddprc.json)
  --help                  Show this help message
  --version               Show version number

Callers Options:
  --file <path>           Source file containing the target symbol (required)
  --symbol <name>         Symbol name to look up callers for (required)
  --depth <N>             Max depth for caller tree traversal (default: 5)
  --format <type>         Output format: json, text (default: json)
  --root <path>           Project root directory (default: current directory)
  --respect-gitignore     Exclude files matched by .gitignore
  --exclude <glob>        Exclude files matching glob pattern (repeatable)
  --verbose               Enable detailed logging to stderr

Configuration:
  The CLI reads .ddprc.json from --root (or cwd) for analysis settings such
  as maxFiles, coverage globs, rank, cc paths, churn, and excludePatterns.
  Schema: docs/examples/ddprc.schema.json. Example: docs/examples/ddprc.example.json.

  Priority (highest to lowest):
    1. Explicit CLI flag (e.g. --exclude, --respect-gitignore)
    2. .ddprc.json at the project root
    3. Built-in defaults (DDP_CONFIG_DEFAULTS)

  Verbose / debug logging follows the same priority as other flags:
    --verbose / --no-verbose (explicit on the command line) wins over
    "debug": true|false in .ddprc.json, which wins over the default (off).

Examples:
  ddp
  ddp --root ./my-project --output report.json
  ddp callers --file src/utils.ts --symbol processOrder --format text
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

  if (opts.command === 'callers') {
    return runCallers(ctx, parseCallersArgs(ctx.argv));
  }

  return runAnalyze(ctx, opts);
}

/**
 * Run analysis end-to-end with the standard preamble shared by `analyze` and
 * `callers`: resolve root path, build a logger, load `.ddprc.json`, merge with
 * CLI flags, and execute `runCliAnalysis`.
 */
async function executeCliAnalysis(
  ctx: CliContext,
  opts: ResolvableOptions,
): Promise<{ result: AnalysisResult; resolved: CliAnalysisOptions; rootPath: string; logger: Logger }> {
  const rootPath = opts.root ?? ctx.cwd;
  const logger = makeLogger(ctx, opts.verbose);
  const warnFn = (msg: string) => logger.warn?.(msg);

  const config = await loadDdpConfig(rootPath, warnFn);
  const resolved = resolveAnalysisOptions(opts, config, ctx.cwd);
  const result = await runCliAnalysis({ ...resolved, logger });
  return { result, resolved, rootPath, logger };
}

/** Run the default `analyze` command. */
async function runAnalyze(
  ctx: CliContext,
  opts: ReturnType<typeof parseArgs>,
): Promise<number> {
  if (!ANALYZE_FORMATS.includes(opts.format as AnalyzeFormat)) {
    ctx.stderr.write(`Error: unsupported format '${opts.format}'. Supported formats: ${ANALYZE_FORMATS.join(', ')}\n`);
    return 1;
  }

  try {
    const { result, rootPath } = await executeCliAnalysis(ctx, opts);
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

/** Run the `callers` subcommand. */
async function runCallers(ctx: CliContext, opts: ReturnType<typeof parseCallersArgs>): Promise<number> {
  if (!opts.file) {
    ctx.stderr.write('Error: --file is required for the callers command\n');
    return 1;
  }

  if (!opts.symbol) {
    ctx.stderr.write('Error: --symbol is required for the callers command\n');
    return 1;
  }

  if (!CALLERS_FORMATS.includes(opts.format as CallersFormat)) {
    ctx.stderr.write(`Error: unsupported format '${opts.format}'. Supported formats: ${CALLERS_FORMATS.join(', ')}\n`);
    return 1;
  }

  try {
    const { result } = await executeCliAnalysis(ctx, opts);

    // Find the target symbol by name (matching against file path)
    const targetSymbol = findSymbol(result.symbols, opts.file, opts.symbol);
    if (!targetSymbol) {
      ctx.stderr.write(`Error: symbol '${opts.symbol}' not found in '${opts.file}'\n`);
      return 1;
    }

    // Build caller tree from edges
    const tree = callerTree(targetSymbol.id, result.edges, opts.depth);
    const summary = impactSummary(tree);
    const riskLevel = classifyRisk(targetSymbol.f);

    const callersResult: CallersResult = {
      symbol: targetSymbol.name,
      file: opts.file,
      metrics: targetSymbol,
      riskLevel,
      impactSummary: summary,
      callerTree: tree,
    };

    // Build metrics lookup for tree node resolution
    const metricsById = new Map<string, SymbolMetrics>();
    for (const sym of result.symbols) {
      metricsById.set(sym.id, sym);
    }

    // Format and write output
    const output = opts.format === 'text'
      ? formatImpactTreeText(callersResult, metricsById)
      : formatImpactTreeJson(callersResult, metricsById);

    ctx.stdout.write(output);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}


/** Create a Logger from context and verbosity flag. */
function makeLogger(ctx: CliContext, verbose: boolean): Logger {
  return verbose
    ? {
        info(msg: string) { ctx.stderr.write(`[INFO] ${msg}\n`); },
        warn(msg: string) { ctx.stderr.write(`[WARN] ${msg}\n`); },
        error(msg: string) { ctx.stderr.write(`[ERROR] ${msg}\n`); },
        debug(msg: string) { ctx.stderr.write(`[DEBUG] ${msg}\n`); },
      }
    : {
        info() {},
        warn() {},
        error(msg: string) { ctx.stderr.write(`[ERROR] ${msg}\n`); },
      };
}
