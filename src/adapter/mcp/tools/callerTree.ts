/**
 * MCP tool handler: ddp_caller_tree
 *
 * Finds a symbol by name+file, builds its caller tree, and returns a structured
 * CallersResult with per-node metrics and impact summary.
 * Pure function — no MCP SDK dependency.
 */

import type { AnalysisResult } from '../../vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../../core/analyze';
import type { CallersResult } from '../../../core/formatImpactTree';
import { callerTree, impactSummary } from '../../../core/callerTree';
import { classifyRisk } from '../../../core/riskLevel';
import { findSymbol } from '../../../shared/symbolSearch';

/** Extended result that includes the metricsById lookup for JSON formatting. */
export type CallerTreeToolResult = CallersResult & {
  readonly metricsById: ReadonlyMap<string, SymbolMetrics>;
};

/**
 * Build a CallersResult for the given symbol.
 *
 * @param result   Full analysis result from `runCliAnalysis`.
 * @param filePath File path containing the symbol.
 * @param symbolName Symbol name to look up.
 * @param depth    Max depth for caller tree traversal.
 * @throws Error if the symbol is not found.
 */
export function buildCallerTreeResult(
  result: AnalysisResult,
  filePath: string,
  symbolName: string,
  depth: number,
): CallerTreeToolResult {
  const target = findSymbol(result.symbols, filePath, symbolName);
  if (!target) {
    throw new Error(`symbol '${symbolName}' not found in '${filePath}'`);
  }

  const tree = callerTree(target.id, result.edges, depth);
  const summary = impactSummary(tree);
  const riskLevel = classifyRisk(target.f);

  const metricsById = new Map<string, SymbolMetrics>();
  for (const sym of result.symbols) {
    metricsById.set(sym.id, sym);
  }

  return {
    symbol: target.name,
    file: filePath,
    metrics: target,
    riskLevel,
    impactSummary: summary,
    callerTree: tree,
    metricsById,
  };
}
