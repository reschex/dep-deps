/**
 * Tests for MCP tool: ddp_caller_tree
 *
 * Scenario: MCP tool ddp_caller_tree returns nested caller tree
 * From: features/ai-agent-integration.feature
 *
 * Finds a symbol by name+file, builds its caller tree, and returns a CallersResult.
 */

import { describe, it, expect } from 'vitest';
import { buildCallerTreeResult } from './callerTree';
import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';
import type { CallEdge } from '../../../core/rank';

function sym(overrides: Partial<SymbolMetrics> & { id: string; name: string; uri: string }): SymbolMetrics {
  return {
    cc: 1, t: 0, r: 1, crap: 2, f: 2, g: 1, fPrime: 2,
    ...overrides,
  };
}

describe('buildCallerTreeResult', () => {
  it('returns CallersResult with nested callerTree and impactSummary', () => {
    const target = sym({ id: 'file:///src/utils.ts#5:0', uri: 'file:///src/utils.ts', name: 'add', f: 50, cc: 3, t: 0.8, r: 2, crap: 25 });
    const caller = sym({ id: 'file:///src/main.ts#1:0', uri: 'file:///src/main.ts', name: 'run', f: 10 });
    const edges: CallEdge[] = [{ caller: caller.id, callee: target.id }];

    const result: AnalysisResult = {
      symbols: [target, caller],
      fileRollup: new Map(),
      edges,
      edgesCount: 1,
    };

    const out = buildCallerTreeResult(result, 'src/utils.ts', 'add', 5);

    expect(out.symbol).toBe('add');
    expect(out.file).toBe('src/utils.ts');
    expect(out.riskLevel).toBe('LOW');
    expect(out.metrics.f).toBe(50);
    expect(out.impactSummary.directCallers).toBe(1);
    expect(out.impactSummary.totalAffected).toBe(1);
    expect(out.callerTree).toHaveLength(1);
    expect(out.callerTree[0]!.id).toBe(caller.id);
  });

  it('includes per-node metrics in callerTree via metricsById', () => {
    const target = sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'fn', f: 100 });
    const c1 = sym({ id: 'file:///b.ts#1:0', uri: 'file:///b.ts', name: 'caller1', f: 30, cc: 2, t: 0.5, r: 1.5, crap: 5.5 });
    const edges: CallEdge[] = [{ caller: c1.id, callee: target.id }];

    const result: AnalysisResult = {
      symbols: [target, c1],
      fileRollup: new Map(),
      edges,
      edgesCount: 1,
    };

    const out = buildCallerTreeResult(result, 'a.ts', 'fn', 5);

    expect(out.metricsById.get(c1.id)).toBeDefined();
    expect(out.metricsById.get(c1.id)!.f).toBe(30);
  });

  it('throws when symbol not found', () => {
    const result: AnalysisResult = {
      symbols: [sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'other', f: 1 })],
      fileRollup: new Map(),
      edges: [],
      edgesCount: 0,
    };

    expect(() => buildCallerTreeResult(result, 'a.ts', 'missing', 5))
      .toThrow("symbol 'missing' not found in 'a.ts'");
  });

  it('respects depth parameter', () => {
    const leaf = sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'leaf', f: 10 });
    const mid = sym({ id: 'file:///b.ts#1:0', uri: 'file:///b.ts', name: 'mid', f: 20 });
    const top = sym({ id: 'file:///c.ts#1:0', uri: 'file:///c.ts', name: 'top', f: 30 });
    const edges: CallEdge[] = [
      { caller: mid.id, callee: leaf.id },
      { caller: top.id, callee: mid.id },
    ];

    const result: AnalysisResult = {
      symbols: [leaf, mid, top],
      fileRollup: new Map(),
      edges,
      edgesCount: 2,
    };

    // depth=1 should show only direct callers, no grandchildren
    const out = buildCallerTreeResult(result, 'a.ts', 'leaf', 1);

    expect(out.callerTree).toHaveLength(1);
    expect(out.callerTree[0]!.children).toHaveLength(0);
  });

  it('returns empty callerTree when symbol has no callers', () => {
    const target = sym({ id: 'file:///a.ts#1:0', uri: 'file:///a.ts', name: 'entry', f: 5 });
    const result: AnalysisResult = {
      symbols: [target],
      fileRollup: new Map(),
      edges: [],
      edgesCount: 0,
    };

    const out = buildCallerTreeResult(result, 'a.ts', 'entry', 5);

    expect(out.callerTree).toHaveLength(0);
    expect(out.impactSummary.directCallers).toBe(0);
    expect(out.impactSummary.totalAffected).toBe(0);
  });
});
