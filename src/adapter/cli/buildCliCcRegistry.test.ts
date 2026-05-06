/**
 * Tests for the CLI's CC provider registry builder.
 *
 * Confirms the CLI honours `cc.useEslintForTsJs` and `cc.eslintPath` /
 * `pythonPath` / `pmdPath` from `.ddprc.json` — the gap that motivated
 * extracting `registerCcProviders`.
 */

import { describe, it, expect } from 'vitest';
import { FallbackCcProvider } from '../../core/ccRegistry';
import { buildCliCcRegistry } from './buildCliCcRegistry';
import {
  CliEslintCcProvider,
  CliRadonCcProvider,
  CliPmdCcProvider,
} from './cliCcProviders';

const ROOT = process.platform === 'win32' ? 'C:\\proj' : '/proj';

describe('buildCliCcRegistry', () => {
  it('registers CliEslintCcProvider for TS/JS when useEslintForTsJs is true', () => {
    const registry = buildCliCcRegistry({
      cc: { useEslintForTsJs: true, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);

    expect(registry.getForLanguage('typescript')).toBeInstanceOf(CliEslintCcProvider);
    expect(registry.getForLanguage('javascript')).toBeInstanceOf(CliEslintCcProvider);
    expect(registry.getForLanguage('typescriptreact')).toBeInstanceOf(CliEslintCcProvider);
    expect(registry.getForLanguage('javascriptreact')).toBeInstanceOf(CliEslintCcProvider);
  });

  it('falls back when useEslintForTsJs is false', () => {
    const registry = buildCliCcRegistry({
      cc: { useEslintForTsJs: false, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);

    expect(registry.getForLanguage('typescript')).toBeInstanceOf(FallbackCcProvider);
  });

  it('registers CliRadonCcProvider for python regardless of useEslintForTsJs', () => {
    const registryOn = buildCliCcRegistry({
      cc: { useEslintForTsJs: true, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);
    const registryOff = buildCliCcRegistry({
      cc: { useEslintForTsJs: false, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);

    expect(registryOn.getForLanguage('python')).toBeInstanceOf(CliRadonCcProvider);
    expect(registryOff.getForLanguage('python')).toBeInstanceOf(CliRadonCcProvider);
  });

  it('registers CliPmdCcProvider for java regardless of useEslintForTsJs', () => {
    const registry = buildCliCcRegistry({
      cc: { useEslintForTsJs: true, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);

    expect(registry.getForLanguage('java')).toBeInstanceOf(CliPmdCcProvider);
  });

  it('returns fallback for unknown languages', () => {
    const registry = buildCliCcRegistry({
      cc: { useEslintForTsJs: true, eslintPath: 'eslint', pythonPath: 'python', pmdPath: 'pmd' },
    }, ROOT);

    expect(registry.getForLanguage('cobol')).toBeInstanceOf(FallbackCcProvider);
  });
});
