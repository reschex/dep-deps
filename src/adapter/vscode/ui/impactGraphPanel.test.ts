import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ────────────────────────────────────────────────────────
const mockWebviewPanel = {
  webview: {
    html: "",
    onDidReceiveMessage: vi.fn(),
    asWebviewUri: vi.fn((uri: unknown) => uri),
    cspSource: "mock-csp",
  },
  reveal: vi.fn(),
  onDidDispose: vi.fn(),
  dispose: vi.fn(),
};

vi.mock("vscode", () => ({
  window: {
    createWebviewPanel: vi.fn(() => mockWebviewPanel),
  },
  ViewColumn: { Beside: 2 },
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => parts.join("/")),
    parse: vi.fn((s: string) => s),
  },
  EventEmitter: class {
    fire = vi.fn();
    event = vi.fn();
  },
}));

import { ExtensionState } from "../extensionState";
import type { AnalysisResult } from "../analysisOrchestrator";
import { sym } from "../../../core/testFixtures";
import type { CallEdge } from "../../../core/rank";

function fakeAnalysis(
  symbols: AnalysisResult["symbols"],
  edges: CallEdge[]
): AnalysisResult {
  return { symbols, fileRollup: new Map(), edges, edgesCount: edges.length };
}

describe("ImpactGraphPanel", () => {
  let state: ExtensionState;

  beforeEach(() => {
    vi.resetModules();
    state = new ExtensionState();
    mockWebviewPanel.webview.html = "";
    vi.mocked(mockWebviewPanel.reveal).mockReset();
    vi.mocked(mockWebviewPanel.onDidDispose).mockReset();
  });

  it("creates a webview panel with graph HTML when opened", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");
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

    openImpactGraph(state, "A");

    expect(mockWebviewPanel.webview.html).toContain("processOrder");
    expect(mockWebviewPanel.webview.html).toContain("handleCheckout");
    expect(mockWebviewPanel.webview.html).toContain("<svg");
  });

  it("embeds graph layout data as JSON in the HTML", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");
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

    openImpactGraph(state, "A");

    // HTML should contain the graph data for the JS renderer
    expect(mockWebviewPanel.webview.html).toContain('"nodes"');
    expect(mockWebviewPanel.webview.html).toContain('"edges"');
  });

  it("does not create panel when no analysis exists", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");

    openImpactGraph(state, "A");

    // Panel should not have graph content
    expect(mockWebviewPanel.webview.html).toBe("");
  });

  it("shows impact summary stats in the HTML", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "A" },
    ];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "processOrder", f: 100 }),
          sym({ id: "B", name: "handleCheckout", f: 189.2 }),
          sym({ id: "C", name: "submitForm", f: 50 }),
        ],
        edges
      )
    );

    openImpactGraph(state, "A");

    // "2" is in a <span>, so match the text fragments separately
    expect(mockWebviewPanel.webview.html).toContain("direct callers");
    expect(mockWebviewPanel.webview.html).toContain("affected");
    expect(mockWebviewPanel.webview.html).toContain(">2</span> direct callers");
    expect(mockWebviewPanel.webview.html).toContain(">2</span> affected");
  });

  it("renders graph for root-only (no callers) with entry point message", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");
    state.setAnalysis(
      fakeAnalysis([sym({ id: "A", name: "main", f: 5 })], [])
    );

    openImpactGraph(state, "A");

    expect(mockWebviewPanel.webview.html).toContain("main");
    expect(mockWebviewPanel.webview.html).toContain(">0</span> direct callers");
  });

  it("renders multi-level tree with correct edge count", async () => {
    const { openImpactGraph } = await import("./impactGraphPanel");
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "B" },
      { caller: "D", callee: "B" },
    ];
    state.setAnalysis(
      fakeAnalysis(
        [
          sym({ id: "A", name: "fn", f: 100 }),
          sym({ id: "B", name: "fnB", f: 50 }),
          sym({ id: "C", name: "fnC", f: 30 }),
          sym({ id: "D", name: "fnD", f: 10 }),
        ],
        edges
      )
    );

    openImpactGraph(state, "A");

    // Should have nodes and edges in the JSON data
    const html = mockWebviewPanel.webview.html;
    expect(html).toContain("fnB");
    expect(html).toContain("fnC");
    expect(html).toContain("fnD");
    expect(html).toContain(">3</span> affected");
  });
});
