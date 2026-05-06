/**
 * Shared CC provider registration.
 *
 * Both the VS Code adapter (`analysisService.ts`) and the CLI adapter
 * (`cliAnalysis.ts`) construct a `CcProviderRegistry` populated with the
 * same language → provider mapping. This helper is the single point where
 * that mapping lives, so neither side can drift.
 *
 * Each adapter supplies its own concrete provider factories (VS Code-bound
 * vs. Node-only) — the language assignment logic is identical.
 */

import type { CcProviderRegistry } from './ccRegistry';
import type { CyclomaticComplexityProvider } from './ports';

/** Factory functions producing per-language CC providers. */
export type CcProviderFactories = {
  /** Build the ESLint provider used for TypeScript/JavaScript (TSX/JSX). */
  readonly eslint: () => CyclomaticComplexityProvider;
  /** Build the Radon provider used for Python. */
  readonly radon: () => CyclomaticComplexityProvider;
  /** Build the PMD provider used for Java. */
  readonly pmd: () => CyclomaticComplexityProvider;
};

/** Subset of configuration this helper consumes. */
export type CcRegistrationConfig = {
  readonly cc: {
    readonly useEslintForTsJs: boolean;
  };
};

/** Language IDs covered by the ESLint provider. */
const TS_JS_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
] as const;

/**
 * Register CC providers on the given registry using `factories`.
 *
 * - When `cc.useEslintForTsJs` is true, ESLint covers TS/JS/TSX/JSX.
 * - Radon is always registered for Python.
 * - PMD is always registered for Java.
 *
 * Factories are invoked at most once each — providers may hold state.
 */
export function registerCcProviders(
  registry: CcProviderRegistry,
  config: CcRegistrationConfig,
  factories: CcProviderFactories,
): void {
  if (config.cc.useEslintForTsJs) {
    registry.register({
      supportedLanguages: TS_JS_LANGUAGES,
      provider: factories.eslint(),
    });
  }
  registry.register({
    supportedLanguages: ['python'],
    provider: factories.radon(),
  });
  registry.register({
    supportedLanguages: ['java'],
    provider: factories.pmd(),
  });
}
