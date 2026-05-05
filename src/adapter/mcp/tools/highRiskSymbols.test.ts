/**
 * Tests for MCP tool: ddp_high_risk_symbols
 *
 * Scenario: MCP tool ddp_high_risk_symbols returns filtered list
 * From: features/ai-agent-integration.feature
 *
 * Filters symbols in a file by an F threshold and returns sorted by F descending.
 */

import { describe, it, expect } from 'vitest';
import { highRiskSymbols } from './highRiskSymbols';
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

describe('highRiskSymbols', () => {
  it('returns only symbols above fMin threshold, sorted by F descending', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'low', f: 30 }),
      sym({ id: 'file:///a.ts#2:0', uri: 'file:///a.ts', name: 'mid', f: 150 }),
      sym({ id: 'file:///a.ts#3:0', uri: 'file:///a.ts', name: 'high', f: 500 }),
    ]);

    const out = highRiskSymbols(result, 'a.ts', 100);

    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBe('high');  // F=500
    expect(out[1]!.name).toBe('mid');   // F=150
  });

  it('defaults fMin to 0 (returns all symbols)', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'tiny', f: 1 }),
      sym({ id: 'file:///a.ts#2:0', uri: 'file:///a.ts', name: 'small', f: 5 }),
    ]);

    const out = highRiskSymbols(result, 'a.ts');

    expect(out).toHaveLength(2);
  });

  it('returns empty array when no symbols exceed threshold', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'safe', f: 10 }),
    ]);

    const out = highRiskSymbols(result, 'a.ts', 100);

    expect(out).toEqual([]);
  });

  it('includes symbol with F exactly equal to fMin (inclusive boundary)', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'exact', f: 100 }),
      sym({ id: 'file:///a.ts#2:0', uri: 'file:///a.ts', name: 'below', f: 99 }),
    ]);

    const out = highRiskSymbols(result, 'a.ts', 100);

    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('exact');
  });

  it('filters to the specified file before applying threshold', () => {
    const result = makeResult([
      sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'inA', f: 200 }),
      sym({ id: 'file:///b.ts#1:0', uri: 'file:///b.ts', name: 'inB', f: 999 }),
    ]);

    const out = highRiskSymbols(result, 'a.ts', 100);

    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('inA');
  });
});
