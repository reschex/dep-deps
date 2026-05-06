/**
 * Build a `CcProviderRegistry` populated for headless CLI use.
 *
 * Wires the CLI-side CC providers (no `vscode` dependency) through the
 * shared `registerCcProviders` helper, so VS Code and CLI registrations
 * stay structurally identical.
 */

import { CcProviderRegistry } from '../../core/ccRegistry';
import { registerCcProviders } from '../../core/registerCcProviders';
import {
  CliEslintCcProvider,
  CliRadonCcProvider,
  CliPmdCcProvider,
} from './cliCcProviders';

/** Subset of configuration this builder needs. */
export type CliCcConfig = {
  readonly cc: {
    readonly useEslintForTsJs: boolean;
    readonly eslintPath: string;
    readonly pythonPath: string;
    readonly pmdPath: string;
  };
};

/** Construct a registry with CLI-bound CC providers wired for the given root. */
export function buildCliCcRegistry(config: CliCcConfig, rootPath: string): CcProviderRegistry {
  const registry = new CcProviderRegistry();
  registerCcProviders(registry, config, {
    eslint: () => new CliEslintCcProvider(config.cc.eslintPath, rootPath),
    radon: () => new CliRadonCcProvider(config.cc.pythonPath, rootPath),
    pmd: () => new CliPmdCcProvider(config.cc.pmdPath, rootPath),
  });
  return registry;
}
