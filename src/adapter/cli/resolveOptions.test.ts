/**
 * Tests for CLI option resolution (merging CLI args with .ddprc.json config).
 *
 * Merge priority: CLI explicit args > .ddprc.json > built-in defaults
 */

import { describe, it, expect } from 'vitest';
import { resolveAnalysisOptions } from './resolveOptions';
import { DDP_CONFIG_DEFAULTS, type DdpFileConfig } from '../../core/config';
import type { CliOptions } from './parseArgs';

/** Minimal CliOptions with all defaults (no flags set). */
function defaultCliOpts(overrides?: Partial<CliOptions>): CliOptions {
  return {
    command: 'analyze',
    root: undefined,
    output: undefined,
    format: 'json',
    respectGitignore: false,
    respectGitignoreExplicit: false,
    excludePatterns: [],
    skipCallGraph: false,
    verbose: false,
    verboseExplicit: false,
    help: false,
    version: false,
    ...overrides,
  };
}

/** Config with specific overrides. */
function configWith(overrides: Partial<DdpFileConfig>): DdpFileConfig {
  return { ...DDP_CONFIG_DEFAULTS, ...overrides };
}

describe('resolveAnalysisOptions', () => {
  it('uses maxFiles from config (no CLI arg for maxFiles)', () => {
    const config = configWith({ maxFiles: 42 });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');

    expect(result.maxFiles).toBe(42);
  });

  it('uses lcovGlob from config', () => {
    const config = configWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, lcovGlob: '**/lcov.info' },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');

    expect(result.lcovGlob).toBe('**/lcov.info');
  });

  it('uses respectGitignore from config when CLI did not set flag', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, respectGitignore: true },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');

    expect(result.respectGitignore).toBe(true);
  });

  it('uses CLI respectGitignore when explicitly set via --respect-gitignore', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, respectGitignore: false },
    });
    const opts = defaultCliOpts({ respectGitignore: true, respectGitignoreExplicit: true });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.respectGitignore).toBe(true);
  });

  it('uses CLI respectGitignore when explicitly negated via --no-respect-gitignore', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, respectGitignore: true },
    });
    const opts = defaultCliOpts({ respectGitignore: false, respectGitignoreExplicit: true });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.respectGitignore).toBe(false);
  });

  it('uses excludePatterns from config when CLI has none', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, excludePatterns: ['**/*.test.*'] },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');

    expect(result.excludePatterns).toEqual(['**/*.test.*']);
  });

  it('uses CLI excludePatterns when user provided --exclude flags', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, excludePatterns: ['**/*.test.*'] },
    });
    const opts = defaultCliOpts({ excludePatterns: ['**/legacy/**'] });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.excludePatterns).toEqual(['**/legacy/**']);
  });

  it('uses debug from config when CLI --verbose not set', () => {
    const config = configWith({ debug: true });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');

    expect(result.debugEnabled).toBe(true);
  });

  it('explicit CLI --verbose overrides config debug=false', () => {
    const config = configWith({ debug: false });
    const opts = defaultCliOpts({ verbose: true, verboseExplicit: true });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.debugEnabled).toBe(true);
  });

  it('explicit CLI --no-verbose overrides config debug=true', () => {
    const config = configWith({ debug: true });
    const opts = defaultCliOpts({ verbose: false, verboseExplicit: true });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.debugEnabled).toBe(false);
  });

  it('non-explicit verbose=false does NOT suppress config debug=true', () => {
    // Sanity: parser default (verbose=false, verboseExplicit=false) means
    // "user didn't set the flag" — config wins.
    const config = configWith({ debug: true });
    const opts = defaultCliOpts({ verbose: false, verboseExplicit: false });
    const result = resolveAnalysisOptions(opts, config, '/proj');

    expect(result.debugEnabled).toBe(true);
  });

  it('passes through skipCallGraph from CLI', () => {
    const result = resolveAnalysisOptions(
      defaultCliOpts({ skipCallGraph: true }),
      DDP_CONFIG_DEFAULTS,
      '/proj',
    );

    expect(result.skipCallGraph).toBe(true);
  });

  it('sets rootPath from CLI root when provided', () => {
    const opts = defaultCliOpts({ root: '/custom/root' });
    const result = resolveAnalysisOptions(opts, DDP_CONFIG_DEFAULTS, '/cwd');

    expect(result.rootPath).toBe('/custom/root');
  });

  it('falls back to cwd when CLI root is undefined', () => {
    const result = resolveAnalysisOptions(defaultCliOpts(), DDP_CONFIG_DEFAULTS, '/cwd');

    expect(result.rootPath).toBe('/cwd');
  });

  it('returns all defaults when config is defaults and CLI has no flags', () => {
    const result = resolveAnalysisOptions(defaultCliOpts(), DDP_CONFIG_DEFAULTS, '/proj');

    expect(result).toEqual({
      rootPath: '/proj',
      maxFiles: DDP_CONFIG_DEFAULTS.maxFiles,
      lcovGlob: DDP_CONFIG_DEFAULTS.coverage.lcovGlob,
      jacocoGlob: DDP_CONFIG_DEFAULTS.coverage.jacocoGlob,
      respectGitignore: DDP_CONFIG_DEFAULTS.fileFilter.respectGitignore,
      excludePatterns: DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns,
      skipCallGraph: false,
      debugEnabled: false,
      rank: DDP_CONFIG_DEFAULTS.rank,
      cc: DDP_CONFIG_DEFAULTS.cc,
      fileRollup: DDP_CONFIG_DEFAULTS.fileRollup,
    });
  });

  it('passes rank from config to runCliAnalysis options', () => {
    const config = configWith({
      rank: { maxIterations: 250, epsilon: 1e-9 },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');
    expect(result.rank).toEqual({ maxIterations: 250, epsilon: 1e-9 });
  });

  it('passes cc from config to runCliAnalysis options', () => {
    const config = configWith({
      cc: {
        useEslintForTsJs: false,
        eslintPath: '/custom/eslint',
        pythonPath: 'python3.12',
        pmdPath: '/opt/pmd',
      },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');
    expect(result.cc).toEqual({
      useEslintForTsJs: false,
      eslintPath: '/custom/eslint',
      pythonPath: 'python3.12',
      pmdPath: '/opt/pmd',
    });
  });

  it('passes jacocoGlob from config', () => {
    const config = configWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, jacocoGlob: '**/jacoco-custom.xml' },
    });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');
    expect(result.jacocoGlob).toBe('**/jacoco-custom.xml');
  });

  it('passes fileRollup from config', () => {
    const config = configWith({ fileRollup: 'sum' });
    const result = resolveAnalysisOptions(defaultCliOpts(), config, '/proj');
    expect(result.fileRollup).toBe('sum');
  });
});
