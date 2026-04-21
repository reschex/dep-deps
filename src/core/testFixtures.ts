import type { SymbolMetrics } from "./analyze";

export function sym(overrides: Partial<SymbolMetrics> & { id: string }): SymbolMetrics {
  return {
    uri: "file:///a.ts",
    name: "fn",
    cc: 2,
    t: 0.5,
    r: 1,
    crap: 2.25,
    f: 2.25,
    g: 1,
    fPrime: 2.25,
    ...overrides,
  };
}
