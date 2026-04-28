import type { SymbolMetrics } from "../../core/analyze";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";

export class ExtensionState {
  private _lastAnalysis: AnalysisResult | undefined;
  private _generation = 0;
  private _symbolsById = new Map<string, SymbolMetrics>();
  private _scope: AnalysisScope | undefined;

  get lastAnalysis(): AnalysisResult | undefined {
    return this._lastAnalysis;
  }

  /** Lookup symbol metrics by ID. Rebuilt on each analysis update. */
  get symbolById(): ReadonlyMap<string, SymbolMetrics> {
    return this._symbolsById;
  }

  get analysisGeneration(): number {
    return this._generation;
  }

  get lastScope(): AnalysisScope | undefined {
    return this._scope;
  }

  setAnalysis(result: AnalysisResult | undefined, scope?: AnalysisScope): void {
    this._lastAnalysis = result;
    this._scope = scope;
    this._generation += 1;
    this._symbolsById = new Map(result?.symbols.map((s) => [s.id, s]) ?? []);
  }
}
