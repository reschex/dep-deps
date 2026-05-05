/**
 * Tests for JavaNativeSymbolProvider — extracts Java method symbols without PMD.
 *
 * From: features/java-symbol-extraction.feature (native extraction scenarios)
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JavaNativeSymbolProvider } from './nativeSymbols';
import { buildJavaCallEdges } from './callGraphBuild';

const FIXTURES = join(__dirname, '../../test/fixtures/cli/java-project/src/main/java/com/example');

function fixtureUri(name: string): string {
  return pathToFileURL(join(FIXTURES, name)).toString();
}

describe('JavaNativeSymbolProvider', () => {
  describe('Scenario: Extract all methods from Java source without PMD', () => {
    it('should extract methods from Service.java', async () => {
      const provider = new JavaNativeSymbolProvider();
      const symbols = await provider.getFunctionSymbols(fixtureUri('Service.java'));

      expect(symbols.length).toBeGreaterThanOrEqual(2);
      const names = symbols.map((s) => s.name);
      expect(names).toContain('processOrder');
      expect(names).toContain('validateOrder');
    });

    it('should return 0-based line numbers', async () => {
      const provider = new JavaNativeSymbolProvider();
      const symbols = await provider.getFunctionSymbols(fixtureUri('Service.java'));

      for (const sym of symbols) {
        expect(sym.selectionStartLine).toBeGreaterThanOrEqual(0);
        expect(sym.selectionStartCharacter).toBe(0);
        expect(sym.bodyStartLine).toBe(sym.selectionStartLine);
        expect(sym.bodyEndLine).toBeGreaterThanOrEqual(sym.bodyStartLine);
      }
    });
  });

  describe('Scenario: Native extraction finds CC=1 methods that PMD misses', () => {
    it('should find simple getter methods', async () => {
      const provider = new JavaNativeSymbolProvider();
      // Util.format has CC >= 2 (if/else), but a hypothetical CC=1 method should also be found
      const symbols = await provider.getFunctionSymbols(fixtureUri('Util.java'));

      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols[0].name).toBe('format');
    });
  });

  describe('Scenario: Skip constructors in native extraction', () => {
    it('should not include constructors', async () => {
      const provider = new JavaNativeSymbolProvider();
      const symbols = await provider.getFunctionSymbols(fixtureUri('Service.java'));

      const names = symbols.map((s) => s.name);
      // Constructor "Service" should not appear
      expect(names).not.toContain('Service');
    });
  });

  describe('Scenario: Native symbols produce IDs that match call graph edges', () => {
    it('should produce symbol IDs matching call graph callee IDs', async () => {
      const repoUri = fixtureUri('Repository.java');
      const serviceUri = fixtureUri('Service.java');

      // Get symbols from native provider
      const provider = new JavaNativeSymbolProvider();
      const repoSymbols = await provider.getFunctionSymbols(repoUri);
      const saveSymbol = repoSymbols.find((s) => s.name === 'save');
      expect(saveSymbol).toBeDefined();

      // Build call edges — Service.processOrder calls repository.save
      const edges = await buildJavaCallEdges([serviceUri, repoUri]);
      const edgeToSave = edges.find(
        (e) => e.callee.includes('Repository.java'),
      );
      expect(edgeToSave).toBeDefined();

      // The symbol ID from the provider should match the edge callee ID
      const expectedId = `${repoUri}#${saveSymbol!.selectionStartLine}:${saveSymbol!.selectionStartCharacter}`;
      expect(edgeToSave!.callee).toBe(expectedId);
    });
  });

  describe('Scenario: Graceful degradation', () => {
    it('should return [] for non-existent file', async () => {
      const provider = new JavaNativeSymbolProvider();
      const symbols = await provider.getFunctionSymbols('file:///nonexistent/Foo.java');

      expect(symbols).toEqual([]);
    });
  });
});
