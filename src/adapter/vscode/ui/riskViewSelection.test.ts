import { describe, it, expect, vi } from "vitest";
import { handleRiskViewSelection } from "./riskViewSelection";
import type { RiskNode } from "./riskTreeProvider";

describe("handleRiskViewSelection", () => {
  it("calls onSymbolSelected with the symbol id when a symbol node is selected", () => {
    const onSymbolSelected = vi.fn();
    const selection: readonly RiskNode[] = [
      { type: "symbol", symbol: { id: "sym-A", name: "processOrder", f: 100, r: 2, cc: 5, t: 0.8, crap: 10, fPrime: 100, g: 1, uri: "file:///src/a.ts" } },
    ];

    handleRiskViewSelection(selection, onSymbolSelected);

    expect(onSymbolSelected).toHaveBeenCalledOnce();
    expect(onSymbolSelected).toHaveBeenCalledWith("sym-A");
  });

  it("does not call onSymbolSelected when selection is empty", () => {
    const onSymbolSelected = vi.fn();

    handleRiskViewSelection([], onSymbolSelected);

    expect(onSymbolSelected).not.toHaveBeenCalled();
  });

  it("does not call onSymbolSelected when selection contains only a file node", () => {
    const onSymbolSelected = vi.fn();
    const selection: readonly RiskNode[] = [
      { type: "file", uri: "file:///src/a.ts", label: "a.ts" },
    ];

    handleRiskViewSelection(selection, onSymbolSelected);

    expect(onSymbolSelected).not.toHaveBeenCalled();
  });

  it("does not call onSymbolSelected when selection contains only a scope node", () => {
    const onSymbolSelected = vi.fn();
    const selection: readonly RiskNode[] = [
      { type: "scope", label: "workspace" },
    ];

    handleRiskViewSelection(selection, onSymbolSelected);

    expect(onSymbolSelected).not.toHaveBeenCalled();
  });

  it("does not call onSymbolSelected when selection contains only an empty node", () => {
    const onSymbolSelected = vi.fn();
    const selection: readonly RiskNode[] = [
      { type: "empty", message: "Run analysis" },
    ];

    handleRiskViewSelection(selection, onSymbolSelected);

    expect(onSymbolSelected).not.toHaveBeenCalled();
  });

  it("calls onSymbolSelected with the first symbol id when multiple symbol nodes are selected", () => {
    const onSymbolSelected = vi.fn();
    const selection: readonly RiskNode[] = [
      { type: "symbol", symbol: { id: "sym-A", name: "fnA", f: 100, r: 2, cc: 5, t: 0.8, crap: 10, fPrime: 100, g: 1, uri: "file:///src/a.ts" } },
      { type: "symbol", symbol: { id: "sym-B", name: "fnB", f: 50, r: 1, cc: 3, t: 0.9, crap: 5, fPrime: 50, g: 1, uri: "file:///src/b.ts" } },
    ];

    handleRiskViewSelection(selection, onSymbolSelected);

    expect(onSymbolSelected).toHaveBeenCalledOnce();
    expect(onSymbolSelected).toHaveBeenCalledWith("sym-A");
  });
});
