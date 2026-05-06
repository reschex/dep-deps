/**
 * Tests for the shared CC provider registration helper.
 *
 * Verifies the same registration logic VS Code and CLI run produces the
 * expected language → provider mapping based on cc.useEslintForTsJs.
 */

import { describe, it, expect, vi } from 'vitest';
import { CcProviderRegistry, FallbackCcProvider } from './ccRegistry';
import { registerCcProviders, type CcProviderFactories } from './registerCcProviders';
import type { CyclomaticComplexityProvider } from './ports';

/** Build a fresh factory map whose calls record invocation. */
function makeFactories(): {
  factories: CcProviderFactories;
  eslintProvider: CyclomaticComplexityProvider;
  radonProvider: CyclomaticComplexityProvider;
  pmdProvider: CyclomaticComplexityProvider;
  eslintFactory: ReturnType<typeof vi.fn>;
  radonFactory: ReturnType<typeof vi.fn>;
  pmdFactory: ReturnType<typeof vi.fn>;
} {
  const eslintProvider = new FallbackCcProvider();
  const radonProvider = new FallbackCcProvider();
  const pmdProvider = new FallbackCcProvider();
  const eslintFactory = vi.fn(() => eslintProvider);
  const radonFactory = vi.fn(() => radonProvider);
  const pmdFactory = vi.fn(() => pmdProvider);
  return {
    factories: { eslint: eslintFactory, radon: radonFactory, pmd: pmdFactory },
    eslintProvider,
    radonProvider,
    pmdProvider,
    eslintFactory,
    radonFactory,
    pmdFactory,
  };
}

describe('registerCcProviders', () => {
  it('registers ESLint for TS/JS/TSX/JSX when useEslintForTsJs is true', () => {
    const registry = new CcProviderRegistry();
    const { factories, eslintProvider, eslintFactory } = makeFactories();

    registerCcProviders(registry, { cc: { useEslintForTsJs: true } }, factories);

    expect(eslintFactory).toHaveBeenCalledTimes(1);
    expect(registry.getForLanguage('typescript')).toBe(eslintProvider);
    expect(registry.getForLanguage('javascript')).toBe(eslintProvider);
    expect(registry.getForLanguage('typescriptreact')).toBe(eslintProvider);
    expect(registry.getForLanguage('javascriptreact')).toBe(eslintProvider);
  });

  it('skips ESLint registration when useEslintForTsJs is false', () => {
    const registry = new CcProviderRegistry();
    const { factories, eslintFactory } = makeFactories();

    registerCcProviders(registry, { cc: { useEslintForTsJs: false } }, factories);

    expect(eslintFactory).not.toHaveBeenCalled();
    // TS/JS now fall back to the registry's built-in fallback provider.
    expect(registry.getForLanguage('typescript')).toBeInstanceOf(FallbackCcProvider);
  });

  it('always registers Radon for python', () => {
    const registry = new CcProviderRegistry();
    const { factories, radonProvider, radonFactory } = makeFactories();

    registerCcProviders(registry, { cc: { useEslintForTsJs: false } }, factories);

    expect(radonFactory).toHaveBeenCalledTimes(1);
    expect(registry.getForLanguage('python')).toBe(radonProvider);
  });

  it('always registers PMD for java', () => {
    const registry = new CcProviderRegistry();
    const { factories, pmdProvider, pmdFactory } = makeFactories();

    registerCcProviders(registry, { cc: { useEslintForTsJs: true } }, factories);

    expect(pmdFactory).toHaveBeenCalledTimes(1);
    expect(registry.getForLanguage('java')).toBe(pmdProvider);
  });

  it('does not invoke factories more than once', () => {
    const registry = new CcProviderRegistry();
    const { factories, eslintFactory, radonFactory, pmdFactory } = makeFactories();

    registerCcProviders(registry, { cc: { useEslintForTsJs: true } }, factories);

    expect(eslintFactory).toHaveBeenCalledTimes(1);
    expect(radonFactory).toHaveBeenCalledTimes(1);
    expect(pmdFactory).toHaveBeenCalledTimes(1);
  });
});
