export type FileRollupMode = "max" | "sum";

export type SymbolRiskRow = {
  readonly symbolId: string;
  readonly uri: string;
  /** Failure risk F = R × CRAP. */
  readonly f: number;
};

/**
 * Aggregate per-symbol failure risk to file-level scores.
 *
 * @param rows Per-symbol risk data.
 * @param mode "max" highlights the worst hotspot per file; "sum" highlights cumulative file risk.
 * @returns Map from file URI to aggregated risk score.
 */
export function rollupFileRisk(rows: readonly SymbolRiskRow[], mode: FileRollupMode): Map<string, number> {
  const riskByFile = new Map<string, number[]>();
  for (const row of rows) {
    let values = riskByFile.get(row.uri);
    if (!values) {
      values = [];
      riskByFile.set(row.uri, values);
    }
    values.push(row.f);
  }
  const result = new Map<string, number>();
  for (const [uri, values] of riskByFile) {
    if (mode === "sum") {
      result.set(uri, values.reduce((acc, val) => acc + val, 0));
    } else {
      result.set(uri, Math.max(...values));
    }
  }
  return result;
}

/** Classify file risk into decoration tiers for editor highlighting. */
export function decorationTier(
  fileMaxF: number,
  warnThreshold: number,
  errorThreshold: number
): "none" | "warn" | "error" {
  if (fileMaxF >= errorThreshold) {
    return "error";
  }
  if (fileMaxF >= warnThreshold) {
    return "warn";
  }
  return "none";
}
