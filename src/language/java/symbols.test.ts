/**
 * Tests for JavaSymbolProvider — Java symbol extraction via PMD XML.
 *
 * From: features/java-symbol-extraction.feature
 * Unit tests mock the spawn layer; no real PMD process needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the raw PMD spawn function to avoid real subprocess calls
vi.mock('./cc/pmdSpawn', () => ({
  runPmdRaw: vi.fn(),
}));

import { JavaSymbolProvider } from './symbols';
import { runPmdRaw } from './cc/pmdSpawn';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JavaSymbolProvider', () => {
  describe('Scenario: Extract methods from PMD CyclomaticComplexity violations', () => {
    it('should return parsed symbols from PMD XML output', async () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" endline="25" method="process" class="Foo"
               rule="CyclomaticComplexity" priority="3">
      The method 'process' has a cyclomatic complexity of 7.
    </violation>
  </file>
</pmd>`;
      vi.mocked(runPmdRaw).mockResolvedValue(xml);

      const provider = new JavaSymbolProvider('pmd');
      const symbols = await provider.getFunctionSymbols('/project/src/Foo.java');

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe('process');
      expect(symbols[0].bodyStartLine).toBe(9);   // 10 - 1
      expect(symbols[0].bodyEndLine).toBe(24);     // 25 - 1
    });
  });

  it('should pass correct arguments to runPmdRaw', async () => {
    vi.mocked(runPmdRaw).mockResolvedValue('');

    const provider = new JavaSymbolProvider('/opt/pmd/bin/pmd');
    await provider.getFunctionSymbols('/project/src/Bar.java');

    expect(runPmdRaw).toHaveBeenCalledWith(
      '/opt/pmd/bin/pmd',
      '/project/src/Bar.java',
      '.',
      30_000
    );
  });

  it('should decode a percent-encoded Windows URI (file:///c%3A/...) before spawning', async () => {
    vi.mocked(runPmdRaw).mockResolvedValue('');

    const provider = new JavaSymbolProvider('pmd');
    await provider.getFunctionSymbols('file:///c%3A/project/src/Foo.java');

    const calledPath = vi.mocked(runPmdRaw).mock.calls[0][1];
    expect(calledPath).not.toContain('file://');
    expect(calledPath).not.toContain('%3A');     // colon must be decoded
    expect(calledPath.toLowerCase()).toContain('foo.java');
  });

  it('should convert file:// URI to file path before spawning', async () => {
    vi.mocked(runPmdRaw).mockResolvedValue('');

    const provider = new JavaSymbolProvider('pmd');
    const { pathToFileURL } = await import('node:url');
    const { join } = await import('node:path');
    const testPath = join('/tmp', 'src', 'Foo.java');
    const testUri = pathToFileURL(testPath).toString();

    await provider.getFunctionSymbols(testUri);

    const calledPath = vi.mocked(runPmdRaw).mock.calls[0][1];
    expect(calledPath).not.toContain('file://');
    expect(calledPath).toContain('Foo.java');
  });

  it('should pass a custom timeoutMs to runPmdRaw when supplied via constructor', async () => {
    vi.mocked(runPmdRaw).mockResolvedValue('');

    const provider = new JavaSymbolProvider('pmd', 5_000);
    await provider.getFunctionSymbols('/project/src/Baz.java');

    expect(runPmdRaw).toHaveBeenCalledWith(
      'pmd',
      '/project/src/Baz.java',
      '.',
      5_000
    );
  });

  describe('Scenario: Graceful degradation', () => {
    it('should return [] when PMD returns empty output', async () => {
      vi.mocked(runPmdRaw).mockResolvedValue('');

      const provider = new JavaSymbolProvider('pmd');
      const symbols = await provider.getFunctionSymbols('/src/Foo.java');

      expect(symbols).toEqual([]);
    });
  });
});
