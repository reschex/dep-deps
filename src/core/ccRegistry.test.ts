import { describe, it, expect } from "vitest";
import { CcProviderRegistry, FallbackCcProvider } from "./ccRegistry";
import type { CyclomaticComplexityProvider, CcResult, DocumentInfo } from "./ports";

function fakeDoc(languageId: string): DocumentInfo {
  return { uri: "file:///test.ts", languageId, getText: () => "" };
}

function fakeProvider(byLine: Map<number, number>): CyclomaticComplexityProvider {
  return {
    async computeComplexity(): Promise<CcResult> {
      return { byLine, byName: new Map() };
    },
  };
}

describe("CcProviderRegistry", () => {
  it("returns registered provider for matching language", async () => {
    const registry = new CcProviderRegistry();
    const expected = new Map([[5, 7]]);
    registry.register({
      supportedLanguages: ["typescript", "javascript"],
      provider: fakeProvider(expected),
    });

    const provider = registry.getForLanguage("typescript");
    const result = await provider.computeComplexity(fakeDoc("typescript"));
    expect(result.byLine).toBe(expected);
  });

  it("returns fallback for unregistered language", () => {
    const registry = new CcProviderRegistry();
    const provider = registry.getForLanguage("rust");
    expect(provider).toBeInstanceOf(FallbackCcProvider);
  });

  it("last registration wins for same language", async () => {
    const registry = new CcProviderRegistry();
    registry.register({
      supportedLanguages: ["python"],
      provider: fakeProvider(new Map([[1, 2]])),
    });
    registry.register({
      supportedLanguages: ["python"],
      provider: fakeProvider(new Map([[1, 99]])),
    });

    const result = await registry.getForLanguage("python").computeComplexity(fakeDoc("python"));
    expect(result.byLine.get(1)).toBe(99);
  });
});

describe("FallbackCcProvider", () => {
  it("returns empty maps", async () => {
    const provider = new FallbackCcProvider();
    const result = await provider.computeComplexity(fakeDoc("unknown"));
    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
  });
});
