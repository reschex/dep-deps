/**
 * Registry for cyclomatic complexity providers.
 *
 * Each provider handles specific languages. The registry selects the right provider
 * for a given language, falling back to the built-in estimator.
 */

import type { CyclomaticComplexityProvider, CcResult, DocumentInfo } from "./ports";

/** A CC provider that covers one or more languages. */
export type LanguageCcProvider = {
  readonly supportedLanguages: readonly string[];
  readonly provider: CyclomaticComplexityProvider;
};

/** Fallback provider that works offline for all languages via regex-based estimation. */
export class FallbackCcProvider implements CyclomaticComplexityProvider {
  async computeComplexity(_doc: DocumentInfo): Promise<CcResult> {
    // The fallback only provides per-symbol estimation, not per-document.
    // It returns empty maps; the orchestrator uses estimateCyclomaticComplexity per symbol body.
    return { byLine: new Map(), byName: new Map() };
  }
}

export class CcProviderRegistry {
  private readonly providers = new Map<string, CyclomaticComplexityProvider>();
  private readonly fallback: CyclomaticComplexityProvider = new FallbackCcProvider();

  register(entry: LanguageCcProvider): void {
    for (const lang of entry.supportedLanguages) {
      this.providers.set(lang, entry.provider);
    }
  }

  getForLanguage(languageId: string): CyclomaticComplexityProvider {
    return this.providers.get(languageId) ?? this.fallback;
  }
}
