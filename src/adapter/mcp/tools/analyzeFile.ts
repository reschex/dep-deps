/**
 * MCP tool handler: ddp_analyze_file
 *
 * Filters analysis results to a single file and returns symbols sorted by F descending.
 * Pure function — no MCP SDK dependency. Wired by the MCP server index.
 */

import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';
import { matchesFilePath } from '../../../shared/symbolSearch';

/**
 * Return all symbols in the given file, sorted by failure risk (F) descending.
 *
 * File matching uses path-boundary logic: "utils.ts" won't match "myutils.ts".
 *
 * @param result   Full analysis result from `runCliAnalysis`.
 * @param filePath Relative or absolute file path to filter by.
 */
export function analyzeFile(
  result: AnalysisResult,
  filePath: string,
): SymbolMetrics[] {
  return result.symbols
    .filter((s) => matchesFilePath(s.uri, filePath))
    .sort((a, b) => b.f - a.f);
}
