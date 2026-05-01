/**
 * Tests for PythonSymbolProvider — Python symbol extraction provider.
 *
 * From: features/python-symbol-extraction.feature
 * Unit tests mock the spawn layer; integration tests use real Python (skip if unavailable).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the spawn module to avoid real subprocess calls in unit tests
vi.mock('./symbolsSpawn', () => ({
  runPythonSymbolExtraction: vi.fn(),
}));

import { PythonSymbolProvider } from './symbols';
import { runPythonSymbolExtraction } from './symbolsSpawn';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PythonSymbolProvider', () => {
  describe('Scenario: Extract top-level function', () => {
    it('should return parsed symbols from spawn output', async () => {
      const json = JSON.stringify([
        {
          name: 'top_level',
          selectionStartLine: 0,
          selectionStartCharacter: 0,
          bodyStartLine: 0,
          bodyEndLine: 1,
        },
      ]);
      vi.mocked(runPythonSymbolExtraction).mockResolvedValue(json);

      const provider = new PythonSymbolProvider('python3');
      const symbols = await provider.getFunctionSymbols('/src/app.py');

      expect(symbols).toEqual([
        {
          name: 'top_level',
          selectionStartLine: 0,
          selectionStartCharacter: 0,
          bodyStartLine: 0,
          bodyEndLine: 1,
        },
      ]);
    });
  });

  it('should pass correct arguments to runPythonSymbolExtraction', async () => {
    vi.mocked(runPythonSymbolExtraction).mockResolvedValue('[]');

    const provider = new PythonSymbolProvider('/usr/bin/python3');
    await provider.getFunctionSymbols('/project/src/app.py');

    // cwd is '.' because the inline Python script opens the file by absolute path (sys.argv[1]).
    // The subprocess working directory is irrelevant and '.'' is the honest default.
    expect(runPythonSymbolExtraction).toHaveBeenCalledWith(
      '/usr/bin/python3',
      '/project/src/app.py',
      '.',
      10_000
    );
  });

  it('should use the default timeout of 10 000 ms when no timeout is specified', async () => {
    vi.mocked(runPythonSymbolExtraction).mockResolvedValue('[]');

    const provider = new PythonSymbolProvider('python3');
    await provider.getFunctionSymbols('/src/app.py');

    const calledTimeout = vi.mocked(runPythonSymbolExtraction).mock.calls[0][3];
    expect(calledTimeout).toBe(10_000);
  });

  it('should use a custom timeoutMs when provided to the constructor', async () => {
    vi.mocked(runPythonSymbolExtraction).mockResolvedValue('[]');

    const provider = new PythonSymbolProvider('python3', 3_000);
    await provider.getFunctionSymbols('/src/app.py');

    const calledTimeout = vi.mocked(runPythonSymbolExtraction).mock.calls[0][3];
    expect(calledTimeout).toBe(3_000);
  });

  it('should convert file:// URI to file path before spawning', async () => {
    vi.mocked(runPythonSymbolExtraction).mockResolvedValue('[]');

    const provider = new PythonSymbolProvider('python3');
    // Use pathToFileURL to generate a valid file URI for the current platform
    const { pathToFileURL } = await import('node:url');
    const { join } = await import('node:path');
    const testPath = join('/tmp', 'src', 'app.py');
    const testUri = pathToFileURL(testPath).toString();

    await provider.getFunctionSymbols(testUri);

    expect(runPythonSymbolExtraction).toHaveBeenCalledWith(
      'python3',
      expect.stringContaining('app.py'),
      expect.any(String),
      10_000
    );
    // Should NOT pass file:// URI directly
    const calledPath = vi.mocked(runPythonSymbolExtraction).mock.calls[0][1];
    expect(calledPath).not.toContain('file://');
  });

  it('should decode percent-encoded characters in VS Code-style Windows URIs (file:///c%3A/...)', async () => {
    // Regression test: the old regex approach could not decode %3A (colon) in drive letters,
    // producing `/c%3A/path` instead of `c:\path`. fileURLToPath() handles percent-decoding
    // correctly on all platforms.
    vi.mocked(runPythonSymbolExtraction).mockResolvedValue('[]');

    const provider = new PythonSymbolProvider('python3');
    // URI with percent-encoded colon, as VS Code produces on Windows: file:///c%3A/code/src/app.py
    await provider.getFunctionSymbols('file:///c%3A/code/src/app.py');

    const calledPath = vi.mocked(runPythonSymbolExtraction).mock.calls[0][1];
    // The path must not contain the raw percent-encoding — %3A must have been decoded
    expect(calledPath).not.toContain('%3A');
    // The path must not contain the file:// prefix
    expect(calledPath).not.toContain('file://');
  });

  describe('Scenario: Graceful degradation', () => {
    it('should return [] when spawn returns empty string', async () => {
      vi.mocked(runPythonSymbolExtraction).mockResolvedValue('');

      const provider = new PythonSymbolProvider('python3');
      const symbols = await provider.getFunctionSymbols('/src/app.py');

      expect(symbols).toEqual([]);
    });
  });
});
