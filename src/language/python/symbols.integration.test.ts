/**
 * Integration tests for PythonSymbolProvider — uses real Python subprocess.
 *
 * From: features/python-symbol-extraction.feature
 * Skips gracefully if python3 is not available in PATH.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { spawnAndCollect } from '../../shared/spawnCollect';
import { PythonSymbolProvider } from './symbols';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'simple.py');

/**
 * Resolves the available Python executable, or returns `undefined` if none found.
 * Tries `python3` first (preferred), then `python` (Windows fallback).
 * Collapses `isPythonAvailable` + `getPythonCommand` into a single detection pass.
 */
async function resolveAvailablePython(): Promise<string | undefined> {
  for (const cmd of ['python3', 'python']) {
    try {
      const out = await spawnAndCollect(cmd, ['--version'], '.', 5000);
      if (out) return cmd;
    } catch {
      // not found — try next
    }
  }
  return undefined;
}

describe('PythonSymbolProvider integration', () => {
  let pythonCmd: string | undefined;

  beforeAll(async () => {
    pythonCmd = await resolveAvailablePython();
  });

  describe('with real Python subprocess', () => {
    it('should extract all functions from simple.py fixture', async () => {
      if (!pythonCmd) return; // skip when Python is unavailable

      const provider = new PythonSymbolProvider(pythonCmd);
      const symbols = await provider.getFunctionSymbols(FIXTURE_PATH);

      const names = symbols.map((s) => s.name);
      expect(names).toContain('top_level');
      expect(names).toContain('method');
      expect(names).toContain('async_method');
      expect(names).toContain('outer');
      expect(names).toContain('inner');
      expect(symbols).toHaveLength(5);
    });

    it('should produce 0-based line numbers', async () => {
      if (!pythonCmd) return;

      const provider = new PythonSymbolProvider(pythonCmd);
      const symbols = await provider.getFunctionSymbols(FIXTURE_PATH);

      // 'top_level' is on line 1 in the file (1-based), so 0 in 0-based
      const topLevel = symbols.find((s) => s.name === 'top_level');
      expect(topLevel).toBeDefined();
      expect(topLevel!.selectionStartLine).toBe(0);
      expect(topLevel!.bodyEndLine).toBe(1);
    });

    it('should return [] for a file with syntax errors', async () => {
      if (!pythonCmd) return;

      // Create a temporary file with invalid Python
      const { writeFile, rm } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const badFile = join(tmpdir(), `ddp-bad-${Date.now()}.py`);
      await writeFile(badFile, 'def broken(\n  syntax error here!!!', 'utf-8');

      try {
        const provider = new PythonSymbolProvider(pythonCmd);
        const symbols = await provider.getFunctionSymbols(badFile);
        expect(symbols).toEqual([]);
      } finally {
        await rm(badFile, { force: true });
      }
    });
  });
});
