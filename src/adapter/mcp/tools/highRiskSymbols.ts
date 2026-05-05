/**
 * MCP tool handler: ddp_high_risk_symbols
 *
 * Returns symbols in a file whose F score exceeds a threshold, sorted by F descending.
 * Pure function — no MCP SDK dependency.
 */

import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';
import { analyzeFile } from './analyzeFile';

/**
 * Return symbols in the given file with F >= fMin, sorted by F descending.
 *
 * @param result   Full analysis result.
 * @param filePath File path to filter by.
 * @param fMin     Minimum F threshold (default: 0 — returns all).
 */
export function highRiskSymbols(
  result: AnalysisResult,
  filePath: string,
  fMin: number = 0,
): SymbolMetrics[] {
  return analyzeFile(result, filePath).filter((s) => s.f >= fMin);
}
