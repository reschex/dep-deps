/**
 * Merge CLI arguments with .ddprc.json configuration.
 *
 * Priority order (highest wins):
 *   1. Explicit CLI args (user typed the flag)
 *   2. `.ddprc.json` at the project root
 *   3. Built-in defaults (`DDP_CONFIG_DEFAULTS`)
 *
 * `loadDdpConfig` has already merged the config file with defaults, so this
 * resolver only decides which CLI args override the merged config.
 */

import type { CliAnalysisOptions } from './cliAnalysis';
import type { DdpFileConfig } from '../../core/config';

/**
 * Project the shared subset of `CliAnalysisOptions` that is fully derivable
 * from a loaded `.ddprc.json` config plus a root path.
 *
 * Both `resolveAnalysisOptions` (CLI flag merge) and `configToAnalysisOptions`
 * (no-flag adapters such as the MCP server) build on top of this projection,
 * overriding only the fields that have CLI-flag semantics.
 */
function configBaseOptions(
  config: DdpFileConfig,
  rootPath: string,
): CliAnalysisOptions {
  return {
    rootPath,
    maxFiles: config.maxFiles,
    lcovGlob: config.coverage.lcovGlob,
    jacocoGlob: config.coverage.jacocoGlob,
    respectGitignore: config.fileFilter.respectGitignore,
    excludePatterns: config.fileFilter.excludePatterns,
    debugEnabled: config.debug,
    rank: config.rank,
    cc: config.cc,
    fileRollup: config.fileRollup,
  };
}

/**
 * Subset of CLI options needed for merge resolution.
 *
 * `respectGitignoreExplicit` distinguishes "user typed the flag" from
 * "parser default" — without it the resolver cannot tell whether to honour
 * the CLI value or fall back to the config file.
 */
export type ResolvableOptions = {
  readonly root: string | undefined;
  readonly respectGitignore: boolean;
  readonly respectGitignoreExplicit: boolean;
  readonly excludePatterns: readonly string[];
  readonly skipCallGraph?: boolean;
  readonly verbose: boolean;
  /** True when --verbose or --no-verbose was set on the command line. */
  readonly verboseExplicit: boolean;
};

/**
 * Resolve final analysis options by merging CLI flags with config.
 *
 * @param opts   - Parsed CLI options (subset of fields used for merging)
 * @param config - Loaded config (from loadDdpConfig, already merged with defaults)
 * @param cwd    - Current working directory (fallback for rootPath)
 */
export function resolveAnalysisOptions(
  opts: ResolvableOptions,
  config: DdpFileConfig,
  cwd: string,
): CliAnalysisOptions {
  const rootPath = opts.root ?? cwd;

  // respectGitignore: CLI value only when the user explicitly typed the flag.
  // Otherwise fall back to config (which already includes defaults).
  const respectGitignore = opts.respectGitignoreExplicit
    ? opts.respectGitignore
    : config.fileFilter.respectGitignore;

  // excludePatterns: CLI wins when user provided any --exclude flags.
  // Empty array means "user didn't provide any" → fall back to config.
  const excludePatterns = opts.excludePatterns.length > 0
    ? opts.excludePatterns
    : config.fileFilter.excludePatterns;

  // debug: explicit CLI flag wins (last-wins for `--verbose` / `--no-verbose`).
  // When the flag was not set, fall back to `.ddprc.json`'s `debug` field.
  const debugEnabled = opts.verboseExplicit ? opts.verbose : config.debug;

  return {
    ...configBaseOptions(config, rootPath),
    respectGitignore,
    excludePatterns,
    skipCallGraph: opts.skipCallGraph ?? false,
    debugEnabled,
  };
}

/**
 * Convert a loaded `.ddprc.json` config directly to CLI analysis options.
 *
 * Used by adapters that have no user-facing flags (e.g. MCP server) — all
 * values come from the config file (which already includes defaults).
 */
export function configToAnalysisOptions(
  config: DdpFileConfig,
  rootPath: string,
): CliAnalysisOptions {
  return configBaseOptions(config, rootPath);
}
