import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ────────────────────────────────────────────────────────
vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

const vscode = await import("vscode");
const { showImpactTree } = await import("./impactTreeCommand");

import { ExtensionState } from "./extensionState";
import type { AnalysisResult } from "./analysisOrchestrator";
import { sym } from "../../core/testFixtures";
import type { CallEdge } from "../../core/rank";

function fakeAnalysis(
  symbols: AnalysisResult["symbols"],
  edges: CallEdge[]
): AnalysisResult {
  return { symbols, fileRollup: new Map(), edges, edgesCount: edges.length };
}

describe("showImpactTree", () => {
  let state: ExtensionState;

  beforeEach(() => {
    state = new ExtensionState();
    vi.mocked(vscode.window.showQuickPick).mockReset();
    vi.mocked(vscode.window.showInformationMessage).mockReset();
    vi.mocked(vscode.window.showErrorMessage).mockReset();
  });

  it("shows error when no analysis results exist", async () => {
    await showImpactTree(state, "someId");
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No analysis results available. Run DDP analysis first."
    );
  });

  it("shows error when symbol not found in analysis", async () => {
    state.setAnalysis(fakeAnalysis([sym({ id: "A", name: "fnA" })], []));
    await showImpactTree(state, "nonexistent");
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Symbol not found in analysis results."
    );
  });

  it("shows info message for entry point (no callers)", async () => {
    state.setAnalysis(fakeAnalysis([sym({ id: "main", name: "main" })], []));
    await showImpactTree(state, "main");
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "No code depends on this symbol"
    );
  });

  it("shows an error when analysis has no call graph edges at all", async () => {
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 600 }),
          sym({ id: "B", name: "handleCheckout", f: 200 }),
        ],
        []
      )
    );

    await showImpactTree(state, "A");

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No call graph edges are available for this analysis. Re-run DDP analysis and check the DDP Risk output channel."
    );
  });

  it("shows QuickPick with caller tree items", async () => {
    const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
        ],
        edges
      )
    );
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await showImpactTree(state, "A");

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
    expect(callArgs).toBeDefined();
    const [items, opts] = callArgs!;
    expect(opts).toMatchObject({ title: "Impact Tree: processOrder" });
    expect((items as Array<{ label: string }>)[0]!.label).toBe("handleCheckout");
  });

  it("returns selected symbol id for navigation", async () => {
    const edges: CallEdge[] = [{ caller: "B", callee: "A" }];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
        ],
        edges
      )
    );
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      id: "B",
      label: "handleCheckout",
      description: "F=189.2 (depth 1)",
    } as never);

    const selectedId = await showImpactTree(state, "A");
    expect(selectedId).toBe("B");
  });
});
