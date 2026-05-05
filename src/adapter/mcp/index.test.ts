/**
 * Tests for MCP server wiring — tool registration and dispatch.
 *
 * Scenario: MCP server registers all four tools and dispatches correctly
 * From: features/ai-agent-integration.feature (MCP Server Scenarios)
 *
 * Tests exercise the server via in-memory transport (no real stdio).
 * Analysis is injected via a factory function to avoid real file I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './index';
import type { AnalysisResult } from '../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../core/analyze';

function sym(overrides: Partial<SymbolMetrics> & { id: string; name: string; uri: string }): SymbolMetrics {
  return { cc: 1, t: 0, r: 1, crap: 2, f: 2, g: 1, fPrime: 2, ...overrides };
}

const FAKE_RESULT: AnalysisResult = {
  symbols: [
    sym({ id: 'file:///src/a.ts#1:0', uri: 'file:///src/a.ts', name: 'low', f: 10, cc: 1, t: 1, r: 1, crap: 1 }),
    sym({ id: 'file:///src/a.ts#5:0', uri: 'file:///src/a.ts', name: 'high', f: 300, cc: 8, t: 0.2, r: 5, crap: 60 }),
    sym({ id: 'file:///src/b.ts#1:0', uri: 'file:///src/b.ts', name: 'other', f: 50, cc: 3, t: 0.5, r: 2, crap: 25 }),
  ],
  fileRollup: new Map(),
  edges: [{ caller: 'file:///src/b.ts#1:0', callee: 'file:///src/a.ts#5:0' }],
  edgesCount: 1,
};

describe('MCP Server', () => {
  let client: Client;

  beforeEach(async () => {
    const fakeRunAnalysis = vi.fn().mockResolvedValue(FAKE_RESULT);
    const server = createMcpServer({ runAnalysis: fakeRunAnalysis, rootPath: '/project' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  it('lists all four tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'ddp_analyze_file',
      'ddp_caller_tree',
      'ddp_high_risk_symbols',
      'ddp_workspace_hotspots',
    ]);
  });

  describe('ddp_analyze_file', () => {
    it('returns symbols for the given file sorted by F descending', async () => {
      const result = await client.callTool({ name: 'ddp_analyze_file', arguments: { path: 'src/a.ts' } });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('high');  // F=300
      expect(parsed[1].name).toBe('low');   // F=10
    });
  });

  describe('ddp_high_risk_symbols', () => {
    it('returns only symbols above fMin threshold', async () => {
      const result = await client.callTool({ name: 'ddp_high_risk_symbols', arguments: { path: 'src/a.ts', fMin: 100 } });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('high');
    });

    it('defaults fMin to 0 (returns all symbols in file)', async () => {
      const result = await client.callTool({ name: 'ddp_high_risk_symbols', arguments: { path: 'src/a.ts' } });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      expect(parsed).toHaveLength(2);
    });
  });

  describe('ddp_caller_tree', () => {
    it('returns caller tree with metrics and impact summary', async () => {
      const result = await client.callTool({
        name: 'ddp_caller_tree',
        arguments: { path: 'src/a.ts', symbol: 'high' },
      });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      expect(parsed.symbol).toBe('high');
      expect(parsed.file).toBe('src/a.ts');
      expect(parsed.riskLevel).toBe('HIGH');
      expect(parsed.impactSummary.directCallers).toBe(1);
      expect(parsed.callerTree).toHaveLength(1);
    });

    it('returns error when symbol not found', async () => {
      const result = await client.callTool({
        name: 'ddp_caller_tree',
        arguments: { path: 'src/a.ts', symbol: 'nonexistent' },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      expect(text).toContain('not found');
    });
  });

  describe('ddp_workspace_hotspots', () => {
    it('returns top N symbols across workspace sorted by F descending', async () => {
      const result = await client.callTool({ name: 'ddp_workspace_hotspots', arguments: { topN: 2 } });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('high');   // F=300
      expect(parsed[1].name).toBe('other');  // F=50
    });

    it('defaults topN to 10', async () => {
      const result = await client.callTool({ name: 'ddp_workspace_hotspots', arguments: {} });
      const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      // Only 3 symbols exist, so all 3 returned (< default 10)
      expect(parsed).toHaveLength(3);
    });
  });

  describe('error handling', () => {
    it('propagates analysis errors as MCP error responses', async () => {
      const failingAnalysis = vi.fn().mockRejectedValue(new Error('analysis failed'));
      const server = createMcpServer({ runAnalysis: failingAnalysis, rootPath: '/project' });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const errorClient = new Client({ name: 'test-client', version: '1.0.0' });
      await errorClient.connect(clientTransport);

      const result = await errorClient.callTool({ name: 'ddp_analyze_file', arguments: { path: 'any.ts' } });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      expect(text).toContain('analysis failed');
    });
  });
});
