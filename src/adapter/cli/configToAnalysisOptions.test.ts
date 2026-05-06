/**
 * Tests for configToAnalysisOptions — maps DdpFileConfig to CliAnalysisOptions.
 *
 * Scenario: MCP server loads .ddprc.json for analysis
 * From: features/config-file.feature
 *
 * Used by the MCP server entry point (bin.ts) to convert the loaded
 * config file into analysis options without CLI flag resolution.
 */

import { describe, it, expect } from 'vitest';
import { configToAnalysisOptions } from './resolveOptions';
import { DDP_CONFIG_DEFAULTS, type DdpFileConfig } from '../../core/config';

/** Helper: config with overrides. */
function configWith(overrides: Partial<DdpFileConfig>): DdpFileConfig {
  return { ...DDP_CONFIG_DEFAULTS, ...overrides };
}

describe('configToAnalysisOptions', () => {
  it('maps rootPath through', () => {
    const result = configToAnalysisOptions(DDP_CONFIG_DEFAULTS, '/project');
    expect(result.rootPath).toBe('/project');
  });

  it('maps maxFiles from config', () => {
    const config = configWith({ maxFiles: 250 });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.maxFiles).toBe(250);
  });

  it('maps coverage.lcovGlob from config', () => {
    const config = configWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, lcovGlob: '**/custom/lcov.info' },
    });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.lcovGlob).toBe('**/custom/lcov.info');
  });

  it('maps coverage.jacocoGlob from config', () => {
    const config = configWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, jacocoGlob: '**/custom-jacoco.xml' },
    });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.jacocoGlob).toBe('**/custom-jacoco.xml');
  });

  it('maps fileFilter.respectGitignore from config', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, respectGitignore: true },
    });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.respectGitignore).toBe(true);
  });

  it('maps fileFilter.excludePatterns from config', () => {
    const config = configWith({
      fileFilter: { ...DDP_CONFIG_DEFAULTS.fileFilter, excludePatterns: ['**/gen/**'] },
    });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.excludePatterns).toEqual(['**/gen/**']);
  });

  it('maps debug to debugEnabled', () => {
    const config = configWith({ debug: true });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.debugEnabled).toBe(true);
  });

  it('maps rank from config', () => {
    const config = configWith({ rank: { maxIterations: 50, epsilon: 1e-3 } });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.rank).toEqual({ maxIterations: 50, epsilon: 1e-3 });
  });

  it('maps cc from config', () => {
    const config = configWith({
      cc: { useEslintForTsJs: false, eslintPath: '/e', pythonPath: '/p', pmdPath: '/m' },
    });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.cc).toEqual({
      useEslintForTsJs: false, eslintPath: '/e', pythonPath: '/p', pmdPath: '/m',
    });
  });

  it('maps fileRollup from config', () => {
    const config = configWith({ fileRollup: 'sum' });
    const result = configToAnalysisOptions(config, '/project');
    expect(result.fileRollup).toBe('sum');
  });

  it('does not set skipCallGraph (MCP always runs full analysis)', () => {
    const result = configToAnalysisOptions(DDP_CONFIG_DEFAULTS, '/project');
    expect(result.skipCallGraph).toBeUndefined();
  });

  it('maps all fields from defaults when config is defaults', () => {
    const result = configToAnalysisOptions(DDP_CONFIG_DEFAULTS, '/root');
    expect(result).toEqual({
      rootPath: '/root',
      maxFiles: DDP_CONFIG_DEFAULTS.maxFiles,
      lcovGlob: DDP_CONFIG_DEFAULTS.coverage.lcovGlob,
      jacocoGlob: DDP_CONFIG_DEFAULTS.coverage.jacocoGlob,
      respectGitignore: DDP_CONFIG_DEFAULTS.fileFilter.respectGitignore,
      excludePatterns: DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns,
      debugEnabled: DDP_CONFIG_DEFAULTS.debug,
      rank: DDP_CONFIG_DEFAULTS.rank,
      cc: DDP_CONFIG_DEFAULTS.cc,
      fileRollup: DDP_CONFIG_DEFAULTS.fileRollup,
    });
  });
});
