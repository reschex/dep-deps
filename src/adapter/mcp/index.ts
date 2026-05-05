/**
 * MCP server for DDP risk analysis — stdio transport.
 *
 * Exposes four tools to any MCP-compatible agent:
 *   - ddp_analyze_file: all symbol metrics for a file
 *   - ddp_caller_tree: nested caller tree for a symbol
 *   - ddp_high_risk_symbols: symbols above an F threshold
 *   - ddp_workspace_hotspots: top N riskiest symbols across workspace
 *
 * Each tool runs the analysis pipeline via an injected `runAnalysis` function,
 * then delegates to a pure handler for filtering/formatting.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AnalysisResult } from '../vscode/analysisOrchestrator';
import type { CliAnalysisOptions } from '../cli/cliAnalysis';
import { analyzeFile } from './tools/analyzeFile';
import { highRiskSymbols } from './tools/highRiskSymbols';
import { workspaceHotspots } from './tools/workspaceHotspots';
import { buildCallerTreeResult } from './tools/callerTree';
import { formatImpactTreeJson } from '../../core/formatImpactTree';

/** Injected analysis runner — testable without real file I/O. */
export type RunAnalysis = (options: CliAnalysisOptions) => Promise<AnalysisResult>;

/** Options for creating the MCP server. */
export type McpServerOptions = {
  readonly runAnalysis: RunAnalysis;
  readonly rootPath: string;
};

/**
 * Create an MCP server with all DDP tools registered.
 * Call `.connect(transport)` to start serving.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const { runAnalysis, rootPath } = options;

  const server = new McpServer({
    name: 'ddp',
    version: '0.1.0',
  }, {
    capabilities: { tools: {} },
  });

  // ── ddp_analyze_file ─────────────────────────────────────────────────

  server.registerTool('ddp_analyze_file', {
    description: 'Return all symbol metrics for a file, sorted by failure risk (F) descending.',
    inputSchema: { path: z.string().describe('Relative file path to analyze') },
  }, async ({ path }) => {
    try {
      const result = await runAnalysis({ rootPath });
      const symbols = analyzeFile(result, path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text' as const, text: errorMessage(err) }] };
    }
  });

  // ── ddp_high_risk_symbols ────────────────────────────────────────────

  server.registerTool('ddp_high_risk_symbols', {
    description: 'Return symbols in a file with F >= threshold, sorted by F descending.',
    inputSchema: {
      path: z.string().describe('Relative file path to analyze'),
      fMin: z.number().optional().describe('Minimum F threshold (default: 0)'),
    },
  }, async ({ path, fMin }) => {
    try {
      const result = await runAnalysis({ rootPath });
      const symbols = highRiskSymbols(result, path, fMin);
      return { content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text' as const, text: errorMessage(err) }] };
    }
  });

  // ── ddp_caller_tree ──────────────────────────────────────────────────

  server.registerTool('ddp_caller_tree', {
    description: 'Return the caller tree for a symbol with per-node metrics and impact summary.',
    inputSchema: {
      path: z.string().describe('File containing the symbol'),
      symbol: z.string().describe('Symbol name to look up'),
      depth: z.number().optional().describe('Max caller tree depth (default: 5)'),
    },
  }, async ({ path, symbol, depth }) => {
    try {
      const result = await runAnalysis({ rootPath });
      const treeResult = buildCallerTreeResult(result, path, symbol, depth ?? 5);
      const json = formatImpactTreeJson(treeResult, treeResult.metricsById);
      return { content: [{ type: 'text' as const, text: json }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text' as const, text: errorMessage(err) }] };
    }
  });

  // ── ddp_workspace_hotspots ───────────────────────────────────────────

  server.registerTool('ddp_workspace_hotspots', {
    description: 'Return the top N riskiest symbols across the workspace, sorted by F descending.',
    inputSchema: {
      topN: z.number().optional().describe('Number of symbols to return (default: 10)'),
    },
  }, async ({ topN }) => {
    try {
      const result = await runAnalysis({ rootPath });
      const symbols = workspaceHotspots(result, topN);
      return { content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text' as const, text: errorMessage(err) }] };
    }
  });

  return server;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
