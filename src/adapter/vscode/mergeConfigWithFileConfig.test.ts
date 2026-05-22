/**
 * Tests for mergeConfigWithFileConfig — layers .ddprc.json over VS Code settings.
 *
 * Scenario: VS Code extension merges .ddprc.json with workspace settings
 * Scenario: .ddprc.json overrides VS Code workspace settings
 * From: features/config-file.feature
 *
 * Priority order (highest to lowest):
 *   1. .ddprc.json values (loaded via loadDdpConfig) — project-wide config wins
 *   2. VS Code workspace/user settings
 *   3. Built-in defaults (DEFAULT_CONFIGURATION)
 */

import { describe, it, expect } from 'vitest';
import { mergeConfigWithFileConfig } from './configuration';
import { DEFAULT_CONFIGURATION, type DdpConfiguration } from './configuration';
import { DDP_CONFIG_DEFAULTS, type DdpFileConfig } from '../../core/config';

/** Helper: file config with one field overridden. */
function fileConfigWith(overrides: Partial<DdpFileConfig>): DdpFileConfig {
  return { ...DDP_CONFIG_DEFAULTS, ...overrides };
}

describe('mergeConfigWithFileConfig', () => {
  it('uses file config maxFiles when VS Code has not explicitly set it', () => {
    const fileConfig = fileConfigWith({ maxFiles: 200 });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.maxFiles).toBe(200);
  });

  it('.ddprc.json maxFiles wins over VS Code workspace setting', () => {
    const vsCodeConfig: DdpConfiguration = { ...DEFAULT_CONFIGURATION, maxFiles: 300 };
    const fileConfig = fileConfigWith({ maxFiles: 200 });
    const result = mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
    expect(result.maxFiles).toBe(200);
  });

  it('uses file config coverage.lcovGlob when VS Code has not explicitly set it', () => {
    const fileConfig = fileConfigWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, lcovGlob: '**/custom/lcov.info' },
    });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.coverage.lcovGlob).toBe('**/custom/lcov.info');
  });

  it('.ddprc.json coverage.lcovGlob wins over VS Code workspace setting', () => {
    const vsCodeConfig: DdpConfiguration = {
      ...DEFAULT_CONFIGURATION,
      coverage: { ...DEFAULT_CONFIGURATION.coverage, lcovGlob: '**/vscode/lcov.info' },
    };
    const fileConfig = fileConfigWith({
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, lcovGlob: '**/custom/lcov.info' },
    });
    const result = mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
    expect(result.coverage.lcovGlob).toBe('**/custom/lcov.info');
  });

  it('uses file config debug when VS Code has not explicitly set it', () => {
    const fileConfig = fileConfigWith({ debug: true });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.debugEnabled).toBe(true);
  });

  it('.ddprc.json debug wins over VS Code workspace setting', () => {
    const vsCodeConfig: DdpConfiguration = { ...DEFAULT_CONFIGURATION, debugEnabled: false };
    const fileConfig = fileConfigWith({ debug: true });
    const result = mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
    expect(result.debugEnabled).toBe(true);
  });

  it('uses file config churn fields when VS Code has not explicitly set them', () => {
    const fileConfig = fileConfigWith({
      churn: { enabled: true, lookbackDays: 60 },
    });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.churn.enabled).toBe(true);
    expect(result.churn.lookbackDays).toBe(60);
  });

  it('uses file config fileFilter fields when VS Code has not explicitly set them', () => {
    const fileConfig = fileConfigWith({
      fileFilter: { respectGitignore: true, excludePatterns: ['**/*.test.*'] },
    });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.fileFilter.respectGitignore).toBe(true);
    expect(result.fileFilter.excludePatterns).toEqual(['**/*.test.*']);
  });

  it('uses file config fileRollup when VS Code has not explicitly set it', () => {
    const fileConfig = fileConfigWith({ fileRollup: 'sum' });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.fileRollup).toBe('sum');
  });

  it('uses file config rank fields when VS Code has not explicitly set them', () => {
    const fileConfig = fileConfigWith({
      rank: { maxIterations: 200, epsilon: 1e-8 },
    });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.rank.maxIterations).toBe(200);
    expect(result.rank.epsilon).toBe(1e-8);
  });

  it('uses file config cc fields when VS Code has not explicitly set them', () => {
    const fileConfig = fileConfigWith({
      cc: { ...DDP_CONFIG_DEFAULTS.cc, eslintPath: '/custom/eslint' },
    });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.cc.eslintPath).toBe('/custom/eslint');
  });

  it('preserves VS Code-only fields (decoration, impactTree, graphView, analysis, codelensEnabled)', () => {
    const fileConfig = fileConfigWith({ maxFiles: 200 });
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);
    expect(result.decoration).toEqual(DEFAULT_CONFIGURATION.decoration);
    expect(result.impactTree).toEqual(DEFAULT_CONFIGURATION.impactTree);
    expect(result.graphView).toEqual(DEFAULT_CONFIGURATION.graphView);
    expect(result.analysis).toEqual(DEFAULT_CONFIGURATION.analysis);
    expect(result.codelensEnabled).toBe(DEFAULT_CONFIGURATION.codelensEnabled);
  });

  it('preserves coverage.fallbackT from VS Code config (no file config equivalent)', () => {
    const vsCodeConfig: DdpConfiguration = {
      ...DEFAULT_CONFIGURATION,
      coverage: { ...DEFAULT_CONFIGURATION.coverage, fallbackT: 0.5 },
    };
    const fileConfig = fileConfigWith({});
    const result = mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
    expect(result.coverage.fallbackT).toBe(0.5);
  });

  it('handles all shared fields overridden in file config with nothing explicit', () => {
    const fileConfig: DdpFileConfig = {
      maxFiles: 999,
      debug: true,
      fileRollup: 'sum',
      fileFilter: { respectGitignore: true, excludePatterns: ['**/gen/**'] },
      coverage: { lcovGlob: '**/custom.info', jacocoGlob: '**/custom-jacoco.xml' },
      cc: { useEslintForTsJs: false, eslintPath: '/e', pythonPath: '/p', pmdPath: '/m' },
      rank: { maxIterations: 50, epsilon: 1e-3 },
      churn: { enabled: true, lookbackDays: 30 },
      agentIntegration: DDP_CONFIG_DEFAULTS.agentIntegration,
      output: DDP_CONFIG_DEFAULTS.output,
    };
    const result = mergeConfigWithFileConfig(DEFAULT_CONFIGURATION, fileConfig);

    expect(result.maxFiles).toBe(999);
    expect(result.debugEnabled).toBe(true);
    expect(result.fileRollup).toBe('sum');
    expect(result.fileFilter.respectGitignore).toBe(true);
    expect(result.fileFilter.excludePatterns).toEqual(['**/gen/**']);
    expect(result.coverage.lcovGlob).toBe('**/custom.info');
    expect(result.coverage.jacocoGlob).toBe('**/custom-jacoco.xml');
    expect(result.cc.useEslintForTsJs).toBe(false);
    expect(result.cc.eslintPath).toBe('/e');
    expect(result.cc.pythonPath).toBe('/p');
    expect(result.cc.pmdPath).toBe('/m');
    expect(result.rank.maxIterations).toBe(50);
    expect(result.rank.epsilon).toBe(1e-3);
    expect(result.churn.enabled).toBe(true);
    expect(result.churn.lookbackDays).toBe(30);
  });

  it('.ddprc.json churn fields win over VS Code workspace settings (file always wins for shared keys)', () => {
    const vsCodeConfig: DdpConfiguration = {
      ...DEFAULT_CONFIGURATION,
      churn: { enabled: false, lookbackDays: 180 },
    };
    const fileConfig = fileConfigWith({
      churn: { enabled: true, lookbackDays: 60 },
    });
    const result = mergeConfigWithFileConfig(vsCodeConfig, fileConfig);
    expect(result.churn.enabled).toBe(true);
    expect(result.churn.lookbackDays).toBe(60);
  });
});
