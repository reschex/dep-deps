import type { SymbolMetrics } from "../core/analyze";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";

export class ExtensionState {
  private _last: AnalysisResult | undefined;
  private _seq = 0;
  private _byId = new Map<string, SymbolMetrics>();
  private _scope: AnalysisScope | undefined;

  get lastAnalysis(): AnalysisResult | undefined {
    return this._last;
  }

  /** Lookup symbol metrics by ID. Rebuilt on each analysis update. */
  get symbolById(): ReadonlyMap<string, SymbolMetrics> {
    return this._byId;
  }

  get analysisGeneration(): number {
    return this._seq;
  }

  get lastScope(): AnalysisScope | undefined {
    return this._scope;
  }

  setAnalysis(result: AnalysisResult | undefined, scope?: AnalysisScope): void {
    this._last = result;
    this._scope = scope;
    this._seq += 1;
    this._byId = new Map(result?.symbols.map((s) => [s.id, s]) ?? []);
  }
}
