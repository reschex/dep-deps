/**
 * Tests for MCP tool: ddp_workspace_hotspots
 *
 * Scenario: MCP tool ddp_workspace_hotspots returns top N across workspace
 * From: features/ai-agent-integration.feature
 *
 * Returns the N highest-F symbols across all files, each with its file path.
 */

import { describe, it, expect } from 'vitest';
import { workspaceHotspots } from './workspaceHotspots';
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

describe('workspaceHotspots', () => {
  it('returns top N symbols by F descending across all files', () => {
    const result = makeResult([
      sym({ id: 'a#1', uri: 'file:///a.ts', name: 'low', f: 10 }),
      sym({ id: 'b#1', uri: 'file:///b.ts', name: 'mid', f: 100 }),
      sym({ id: 'c#1', uri: 'file:///c.ts', name: 'high', f: 500 }),
      sym({ id: 'd#1', uri: 'file:///d.ts', name: 'max', f: 999 }),
    ]);

    const out = workspaceHotspots(result, 2);

    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBe('max');
    expect(out[1]!.name).toBe('high');
  });

  it('defaults topN to 10', () => {
    // 15 symbols — default topN=10 should return only 10
    const symbols = Array.from({ length: 15 }, (_, i) =>
      sym({ id: `s#${i}`, uri: `file:///f${i}.ts`, name: `fn${i}`, f: i }),
    );
    const result = makeResult(symbols);

    const out = workspaceHotspots(result);

    expect(out).toHaveLength(10);
  });

  it('returns all symbols when fewer than topN exist', () => {
    const result = makeResult([
      sym({ id: 'a#1', uri: 'file:///a.ts', name: 'only', f: 42 }),
    ]);

    const out = workspaceHotspots(result, 10);

    expect(out).toHaveLength(1);
  });

  it('includes each symbol uri (file path)', () => {
    const result = makeResult([
      sym({ id: 'x#1', uri: 'file:///src/core/x.ts', name: 'fn', f: 50 }),
    ]);

    const out = workspaceHotspots(result, 5);

    expect(out[0]!.uri).toBe('file:///src/core/x.ts');
  });
});
