/**
 * MCP tool handler: ddp_workspace_hotspots
 *
 * Returns the top N riskiest symbols across the entire workspace, sorted by F descending.
 * Pure function — no MCP SDK dependency.
 */

import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';

/**
 * Return the top N symbols by failure risk (F) across all files.
 *
 * @param result Full analysis result.
 * @param topN   Maximum number of symbols to return (default: 10).
 */
export function workspaceHotspots(
  result: AnalysisResult,
  topN: number = 10,
): SymbolMetrics[] {
  return [...result.symbols]
    .sort((a, b) => b.f - a.f)
    .slice(0, topN);
}
