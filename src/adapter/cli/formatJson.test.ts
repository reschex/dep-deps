/**
 * Tests for JSON Output Formatter
 *
 * Scenarios from: features/json-output.feature
 *
 * Verifies that AnalysisResult is serialised into the documented JSON schema:
 *   { timestamp, summary: { filesAnalyzed, symbolsAnalyzed, averageCC },
 *     files: [{ uri, path, rollupScore, symbols: [...] }] }
 */

import { describe, it, expect } from 'vitest';
import { formatAnalysisAsJson, type JsonOutput } from './formatJson';
import type { AnalysisResult } from '../../adapter/vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../core/analyze';

function makeSymbol(overrides: Partial<SymbolMetrics> & { id: string; uri: string; name: string }): SymbolMetrics {
  return {
    cc: 3, t: 0.5, r: 1, crap: 4.375, f: 4.375, g: 1, fPrime: 4.375,
    ...overrides,
  };
}

const RESULT_WITH_ONE_FILE: AnalysisResult = {
  symbols: [
    makeSymbol({ id: 'file:///workspace/src/utils.ts#1:0', uri: 'file:///workspace/src/utils.ts', name: 'add', cc: 1, t: 1, crap: 1, f: 1, fPrime: 1 }),
  ],
  fileRollup: new Map([['file:///workspace/src/utils.ts', 1]]),
  edges: [],
  edgesCount: 0,
};

describe('formatAnalysisAsJson', () => {
  describe('Scenario: Deterministic timestamp via injected clock', () => {
    it('should use the provided clock for the timestamp', () => {
      // Given a fixed clock
      const fixedDate = new Date('2026-01-01T00:00:00.000Z');
      const clock = () => fixedDate;

      // When I format output with that clock
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace', clock);
      const parsed: JsonOutput = JSON.parse(output);

      // Then the timestamp should be exactly the fixed date
      expect(parsed.timestamp).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('Scenario: Generate valid JSON structure', () => {
    it('should produce valid JSON with timestamp, summary, and files', () => {
      // Given analysis has completed
      // When I format output as JSON
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');

      // Then the output should be valid JSON
      const parsed: JsonOutput = JSON.parse(output);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.files).toBeDefined();
      expect(Array.isArray(parsed.files)).toBe(true);
    });
  });

  describe('Scenario: Include summary statistics', () => {
    it('should include filesAnalyzed and symbolsAnalyzed counts', () => {
      // Given 1 file analyzed with 1 symbol
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');
      const parsed: JsonOutput = JSON.parse(output);

      // Then summary should reflect the counts
      expect(parsed.summary.filesAnalyzed).toBe(1);
      expect(parsed.summary.symbolsAnalyzed).toBe(1);
    });

    it('should include averageCC', () => {
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');
      const parsed: JsonOutput = JSON.parse(output);

      // CC=1 for the single symbol, so averageCC=1
      expect(parsed.summary.averageCC).toBe(1);
    });
  });

  describe('Scenario: Include file-level data', () => {
    it('should include uri, path, and rollupScore for each file', () => {
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');
      const parsed: JsonOutput = JSON.parse(output);

      expect(parsed.files.length).toBe(1);
      const file = parsed.files[0];
      expect(file.uri).toBe('file:///workspace/src/utils.ts');
      expect(file.path).toBe('src/utils.ts');
      expect(file.rollupScore).toBe(1);
    });
  });

  describe('Scenario: Include symbol-level data', () => {
    it('should include name, cc, t, crap, r, f for each symbol', () => {
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');
      const parsed: JsonOutput = JSON.parse(output);

      const sym = parsed.files[0].symbols[0];
      expect(sym.name).toBe('add');
      expect(sym.cc).toBe(1);
      expect(sym.t).toBe(1);
      expect(sym.crap).toBe(1);
      expect(sym.r).toBe(1);
      expect(sym.f).toBe(1);
      expect(sym.g).toBe(1);
      expect(sym.fPrime).toBe(1);
    });
  });

  describe('Scenario: Convert absolute URIs to relative paths', () => {
    it('should strip workspace root from URIs to produce relative paths', () => {
      const output = formatAnalysisAsJson(RESULT_WITH_ONE_FILE, '/workspace');
      const parsed: JsonOutput = JSON.parse(output);

      // file:///workspace/src/utils.ts relative to /workspace → src/utils.ts
      expect(parsed.files[0].path).toBe('src/utils.ts');
    });

    it('should strip a Windows workspace root from URIs to produce relative paths', () => {
      // Given a file URI using Windows-style encoding
      const windowsUri = 'file:///C%3A/code/project/src/utils.ts';
      const result: AnalysisResult = {
        symbols: [
          makeSymbol({ id: 'x#0:0', uri: windowsUri, name: 'fn', cc: 1, t: 1, crap: 1, f: 1, fPrime: 1 }),
        ],
        fileRollup: new Map([[windowsUri, 1]]),
        edges: [],
        edgesCount: 0,
      };

      // When I format with a Windows absolute path as the workspace root
      const output = formatAnalysisAsJson(result, 'C:\\code\\project');
      const parsed: JsonOutput = JSON.parse(output);

      // Then the path should be workspace-relative, not the raw URI
      expect(parsed.files[0].path).toBe('src/utils.ts');
    });
  });

  describe('Scenario: Multiple files with multiple symbols', () => {
    it('should group symbols by file and sort files by rollupScore descending', () => {
      const result: AnalysisResult = {
        symbols: [
          makeSymbol({ id: 'a#0:0', uri: 'file:///ws/src/a.ts', name: 'fnA', cc: 2, f: 5, fPrime: 5 }),
          makeSymbol({ id: 'b#0:0', uri: 'file:///ws/src/b.ts', name: 'fnB1', cc: 10, f: 50, fPrime: 50 }),
          makeSymbol({ id: 'b#5:0', uri: 'file:///ws/src/b.ts', name: 'fnB2', cc: 8, f: 30, fPrime: 30 }),
        ],
        fileRollup: new Map([
          ['file:///ws/src/a.ts', 5],
          ['file:///ws/src/b.ts', 50],
        ]),
        edges: [],
        edgesCount: 0,
      };

      const output = formatAnalysisAsJson(result, '/ws');
      const parsed: JsonOutput = JSON.parse(output);

      // b.ts has higher rollup → comes first
      expect(parsed.files[0].path).toBe('src/b.ts');
      expect(parsed.files[0].symbols.length).toBe(2);
      expect(parsed.files[1].path).toBe('src/a.ts');
      expect(parsed.files[1].symbols.length).toBe(1);
    });
  });
});
