/**
 * Tests for MCP tool: ddp_analyze_file
 *
 * Scenario: MCP tool ddp_analyze_file returns all symbol metrics
 * From: features/ai-agent-integration.feature
 *
 * The tool filters symbols to a given file and returns them sorted by F descending.
 */

import { describe, it, expect } from 'vitest';
import { analyzeFile } from './analyzeFile';
import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';

function sym(overrides: Partial<SymbolMetrics> & { id: string; name: string; uri: string }): SymbolMetrics {
  return {
    cc: 1, t: 0, r: 1, crap: 2, f: 2, g: 1, fPrime: 2,
    ...overrides,
  };
}

function makeResult(symbols: SymbolMetrics[]): AnalysisResult {
  return { symbols, fileRollup: new Map(), edges: [], edgesCount: 0 };
}

describe('analyzeFile', () => {
  it('returns symbols for the given file sorted by F descending', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'foo', f: 50 }),
      sym({ id: 'file:///a.ts#5:0', uri: 'file:///a.ts', name: 'bar', f: 200 }),
      sym({ id: 'file:///b.ts#1:0', uri: 'file:///b.ts', name: 'baz', f: 999 }),
    ]);

    const out = analyzeFile(result, 'a.ts');

    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBe('bar');   // F=200 first
    expect(out[1]!.name).toBe('foo');   // F=50 second
  });

  it('returns symbol with all metric values preserved', () => {
    const result = makeResult([
      sym({ id: 'file:///src/core/x.ts#3:0', uri: 'file:///src/core/x.ts', name: 'compute', cc: 5, t: 0.8, r: 3, crap: 7.04, f: 21.12 }),
    ]);

    const out = analyzeFile(result, 'src/core/x.ts');

    expect(out).toHaveLength(1);
    const s = out[0]!;
    expect(s.id).toBe('file:///src/core/x.ts#3:0');
    expect(s.name).toBe('compute');
    expect(s.uri).toBe('file:///src/core/x.ts');
    expect(s.cc).toBe(5);
    expect(s.t).toBe(0.8);
    expect(s.r).toBe(3);
    expect(s.crap).toBe(7.04);
    expect(s.f).toBe(21.12);
  });

  it('returns empty array when no symbols match the file', () => {
    const result = makeResult([
      sym({ id: 'file:///other.ts#1:0', uri: 'file:///other.ts', name: 'nope', f: 100 }),
    ]);

    const out = analyzeFile(result, 'missing.ts');

    expect(out).toEqual([]);
  });

  it('matches file path at path boundary (no partial match)', () => {
    const result = makeResult([
      sym({ id: 'file:///src/myutils.ts#1:0', uri: 'file:///src/myutils.ts', name: 'a', f: 10 }),
      sym({ id: 'file:///src/utils.ts#1:0', uri: 'file:///src/utils.ts', name: 'b', f: 20 }),
    ]);

    const out = analyzeFile(result, 'utils.ts');

    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('b');
  });
});
