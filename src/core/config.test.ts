/**
 * Tests for .ddprc.json configuration loading.
 *
 * TDD cycle: each test written before implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadDdpConfig, DDP_CONFIG_DEFAULTS } from './config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// We test the real function against the real filesystem via temp directories.
// For speed, we mock fs.readFile to avoid disk I/O.

vi.mock('node:fs/promises');
const mockReadFile = vi.mocked(fs.readFile);

describe('loadDdpConfig', () => {
  const rootPath = '/fake/project';
  const configPath = path.join(rootPath, '.ddprc.json');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null when .ddprc.json does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const config = await loadDdpConfig(rootPath);

    expect(config).toBeNull();
    expect(mockReadFile).toHaveBeenCalledWith(configPath, 'utf-8');
  });

  it('merges valid JSON with defaults', async () => {
    const fileContent = JSON.stringify({
      maxFiles: 500,
      fileFilter: { respectGitignore: true },
      churn: { enabled: true },
    });
    mockReadFile.mockResolvedValue(fileContent);

    const config = await loadDdpConfig(rootPath);

    expect(config.maxFiles).toBe(500);
    expect(config.fileFilter.respectGitignore).toBe(true);
    // Unset sub-fields fall back to defaults
    expect(config.fileFilter.excludePatterns).toEqual(DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns);
    expect(config.churn.enabled).toBe(true);
    expect(config.churn.lookbackDays).toBe(DDP_CONFIG_DEFAULTS.churn.lookbackDays);
    // Unset sections fall back to defaults
    expect(config.coverage).toEqual(DDP_CONFIG_DEFAULTS.coverage);
    expect(config.rank).toEqual(DDP_CONFIG_DEFAULTS.rank);
  });

  it('returns null and warns on invalid JSON', async () => {
    mockReadFile.mockResolvedValue('{ broken json !!!');
    const warn = vi.fn();

    const config = await loadDdpConfig(rootPath, warn);

    expect(config).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/\.ddprc\.json/);
  });

  it('ignores unknown keys (forward-compatible)', async () => {
    const fileContent = JSON.stringify({
      maxFiles: 200,
      futureFeature: { enabled: true },
      anotherUnknownKey: 42,
    });
    mockReadFile.mockResolvedValue(fileContent);

    const config = await loadDdpConfig(rootPath);

    expect(config.maxFiles).toBe(200);
    // Unknown keys must not appear on the returned object
    expect(config).not.toHaveProperty('futureFeature');
    expect(config).not.toHaveProperty('anotherUnknownKey');
  });

  it('loads agentIntegration thresholds', async () => {
    const fileContent = JSON.stringify({
      agentIntegration: {
        warnThreshold: 50,
        blockThreshold: 200,
        skipTestFiles: false,
        skipPatterns: ['**/*.test.ts'],
      },
    });
    mockReadFile.mockResolvedValue(fileContent);

    const config = await loadDdpConfig(rootPath);

    expect(config.agentIntegration.warnThreshold).toBe(50);
    expect(config.agentIntegration.blockThreshold).toBe(200);
    expect(config.agentIntegration.skipTestFiles).toBe(false);
    expect(config.agentIntegration.skipPatterns).toEqual(['**/*.test.ts']);
  });

  it('deep-merges nested objects (partial sub-object)', async () => {
    const fileContent = JSON.stringify({
      coverage: { lcovGlob: '**/lcov.info' },
    });
    mockReadFile.mockResolvedValue(fileContent);

    const config = await loadDdpConfig(rootPath);

    expect(config.coverage.lcovGlob).toBe('**/lcov.info');
    // jacocoGlob should still be the default
    expect(config.coverage.jacocoGlob).toBe(DDP_CONFIG_DEFAULTS.coverage.jacocoGlob);
  });

  it('returns null and warns on read permission errors', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    const warn = vi.fn();

    const config = await loadDdpConfig(rootPath, warn);

    expect(config).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/\.ddprc\.json/);
  });

  it('returns defaults when file contains empty object', async () => {
    mockReadFile.mockResolvedValue('{}');

    const config = await loadDdpConfig(rootPath);

    expect(config).toEqual(DDP_CONFIG_DEFAULTS);
  });

  it('returns defensive copy of arrays from parsed file (mutating result must not poison defaults)', async () => {
    // File present but empty → all fields fall back to defaults. Mutating the
    // returned array must not corrupt DDP_CONFIG_DEFAULTS.
    mockReadFile.mockResolvedValue('{}');
    const before = [...DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns];

    const config = await loadDdpConfig(rootPath);
    // Bypass `readonly` to simulate a misbehaving caller.
    (config!.fileFilter.excludePatterns as string[]).push('**/poison.*');

    expect([...DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns]).toEqual(before);
  });

  it('falls back to default for type-mismatched scalar (silently, no warning)', async () => {
    const warn = vi.fn();
    mockReadFile.mockResolvedValue(JSON.stringify({
      maxFiles: 'lots',           // string, not number
      churn: { lookbackDays: '90' }, // string, not number
    }));

    const config = await loadDdpConfig(rootPath, warn);

    expect(config.maxFiles).toBe(DDP_CONFIG_DEFAULTS.maxFiles);
    expect(config.churn.lookbackDays).toBe(DDP_CONFIG_DEFAULTS.churn.lookbackDays);
    // Type mismatches are silent — they fall through to defaults rather than throw.
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and returns null when JSON root is an array', async () => {
    const warn = vi.fn();
    mockReadFile.mockResolvedValue('[1, 2, 3]');

    const config = await loadDdpConfig(rootPath, warn);

    expect(config).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/expected an object at root/);
  });

  it('warns and returns null when JSON root is a primitive', async () => {
    const warn = vi.fn();
    mockReadFile.mockResolvedValue('42');

    const config = await loadDdpConfig(rootPath, warn);

    expect(config).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('returns defensive copy of parsed arrays (caller mutation does not leak between reads)', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      fileFilter: { excludePatterns: ['**/*.test.*'] },
    }));

    const first = await loadDdpConfig(rootPath);
    (first.fileFilter.excludePatterns as string[]).push('**/extra.*');

    const second = await loadDdpConfig(rootPath);
    expect(second.fileFilter.excludePatterns).toEqual(['**/*.test.*']);
  });
});

describe('DDP_CONFIG_DEFAULTS', () => {
  it('has expected default values for all sections', () => {
    expect(DDP_CONFIG_DEFAULTS.maxFiles).toBe(400);
    expect(DDP_CONFIG_DEFAULTS.debug).toBe(false);
    expect(DDP_CONFIG_DEFAULTS.fileRollup).toBe('max');
    expect(DDP_CONFIG_DEFAULTS.fileFilter.respectGitignore).toBe(false);
    expect(DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns).toEqual([]);
    expect(DDP_CONFIG_DEFAULTS.coverage.lcovGlob).toBe('**/coverage/lcov.info');
    expect(DDP_CONFIG_DEFAULTS.coverage.jacocoGlob).toBe('**/jacoco.xml');
    expect(DDP_CONFIG_DEFAULTS.cc.useEslintForTsJs).toBe(true);
    expect(DDP_CONFIG_DEFAULTS.cc.eslintPath).toBe('eslint');
    expect(DDP_CONFIG_DEFAULTS.cc.pythonPath).toBe('python');
    expect(DDP_CONFIG_DEFAULTS.rank.maxIterations).toBe(100);
    expect(DDP_CONFIG_DEFAULTS.rank.epsilon).toBe(1e-6);
    expect(DDP_CONFIG_DEFAULTS.churn.enabled).toBe(false);
    expect(DDP_CONFIG_DEFAULTS.churn.lookbackDays).toBe(90);
    expect(DDP_CONFIG_DEFAULTS.agentIntegration.warnThreshold).toBe(100);
    expect(DDP_CONFIG_DEFAULTS.agentIntegration.blockThreshold).toBe(500);
    expect(DDP_CONFIG_DEFAULTS.agentIntegration.skipTestFiles).toBe(true);
    expect(DDP_CONFIG_DEFAULTS.agentIntegration.skipPatterns).toEqual(['**/*.json', '**/*.md', '**/*.yml']);
    expect(DDP_CONFIG_DEFAULTS.output.topFilesCount).toBe(20);
    expect(DDP_CONFIG_DEFAULTS.output.topSymbolsCount).toBe(20);
    expect(DDP_CONFIG_DEFAULTS.output.riskThresholds.high).toBe(20);
    expect(DDP_CONFIG_DEFAULTS.output.riskThresholds.medium).toBe(10);
  });
});
