import { crap, failureRiskFromCrap } from "./metrics";
import { computeRanks, type CallEdge, type RankOptions } from "./rank";

/** Input data for a single function/method before metric computation. */
export type SymbolInput = {
  readonly id: string;
  readonly uri: string;
  readonly name: string;
  /** Cyclomatic complexity. */
  readonly cc: number;
  /** Test coverage fraction in [0, 1]. */
  readonly t: number;
};

/** Fully computed metrics for a function/method. */
export type SymbolMetrics = SymbolInput & {
  /** Rank (R) — impact propagation via call graph. */
  readonly r: number;
  /** CRAP score — CC² × (1 − T)³ + CC. */
  readonly crap: number;
  /** Failure risk — F = R × CRAP. */
  readonly f: number;
  /** Churn multiplier (G ≥ 1). 1 until churn is applied. */
  readonly g: number;
  /** Churn-adjusted failure risk — F' = F × G. */
  readonly fPrime: number;
};

/**
 * Compute failure-risk metrics for all symbols.
 *
 * @param edges       Call graph edges (caller → callee).
 * @param symbols     Function/method symbols with CC and coverage.
 * @param rankOptions PageRank convergence parameters.
 * @returns Symbols enriched with rank (R), CRAP, and failure risk (F).
 */
export function computeSymbolMetrics(
  edges: readonly CallEdge[],
  symbols: readonly SymbolInput[],
  rankOptions: Partial<RankOptions> = {}
): SymbolMetrics[] {
  const ranks = computeRanks(edges, rankOptions);
  return symbols.map((symbol) => {
    const rank = ranks.get(symbol.id) ?? 1;
    const crapScore = crap(symbol.cc, symbol.t);
    const failureRisk = failureRiskFromCrap(rank, crapScore);
    return { ...symbol, r: rank, crap: crapScore, f: failureRisk, g: 1, fPrime: failureRisk };
  });
}
