import * as vscode from "vscode";
import type { ExtensionState } from "./extensionState";
import type { SymbolMetrics } from "../../core/analyze";
import type { AnalysisResult } from "./analysisOrchestrator";
import { callerTree, impactSummary, flattenTree, type ImpactItem } from "../../core/callerTree";

const DEFAULT_MAX_DEPTH = 5;

type ValidationResult = {
  readonly analysis: AnalysisResult;
  readonly symbol: SymbolMetrics;
};

async function validateAnalysisState(
  state: ExtensionState,
  symbolId: string
): Promise<ValidationResult | undefined> {
  const analysis = state.lastAnalysis;
  if (!analysis) {
    await vscode.window.showErrorMessage("No analysis results available. Run DDP analysis first.");
    return undefined;
  }

  const symbol = state.symbolById.get(symbolId);
  if (!symbol) {
    await vscode.window.showErrorMessage("Symbol not found in analysis results.");
    return undefined;
  }

  return { analysis, symbol };
}

function formatImpactPlaceholder(summary: { directCallers: number; totalAffected: number }): string {
  const callerText = summary.directCallers === 1 ? "caller" : "callers";
  return `Impact: ${summary.directCallers} direct ${callerText} (${summary.totalAffected} total affected)`;
}

/**
 * Show an impact tree (caller dependency tree) for a symbol via QuickPick.
 *
 * @returns The selected symbol's ID for navigation, or undefined if dismissed.
 */
export async function showImpactTree(
  state: ExtensionState,
  symbolId: string,
  maxDepth = DEFAULT_MAX_DEPTH
): Promise<string | undefined> {
  const validated = await validateAnalysisState(state, symbolId);
  if (!validated) {
    return undefined;
  }

  const { analysis, symbol } = validated;

  if (analysis.edges.length === 0 && analysis.symbols.length > 1) {
    await vscode.window.showErrorMessage(
      "No call graph edges are available for this analysis. Re-run DDP analysis and check the DDP Risk output channel."
    );
    return undefined;
  }

  const tree = callerTree(symbolId, analysis.edges, maxDepth);
  const summary = impactSummary(tree);

  if (summary.totalAffected === 0) {
    await vscode.window.showInformationMessage("No code depends on this symbol");
    return undefined;
  }

  const items = flattenTree(tree, state.symbolById);
  const placeHolder = formatImpactPlaceholder(summary);

  const selected = await vscode.window.showQuickPick(items, {
    title: `Impact Tree: ${symbol.name}`,
    placeHolder,
  });

  return (selected as ImpactItem | undefined)?.id;
}
