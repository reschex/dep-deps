import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";
import { ExtensionState } from "./extensionState";
import type { UiRefreshable } from "./analyzeCommand";

// ── vscode mock ────────────────────────────────────────────────────────
vi.mock("vscode", () => {
  return {
    window: {
      withProgress: async (
        _opts: unknown,
        task: (progress: unknown, token: { isCancellationRequested: boolean }) => Promise<void>,
      ) => {
        await task({}, { isCancellationRequested: false });
      },
    },
    ProgressLocation: { Notification: 15 },
    commands: { executeCommand: vi.fn() },
  };
});

// must be imported after vi.mock
const { AnalyzeCommand } = await import("./analyzeCommand");

// ── helpers ────────────────────────────────────────────────────────────
function fakeResult(): AnalysisResult {
  return { symbols: [], fileRollup: new Map(), edgesCount: 0 };
}

function fakeUi(): UiRefreshable {
  return {
    refreshTree: vi.fn(),
    invalidateCodeLens: vi.fn(),
    applyDecorations: vi.fn(),
  };
}

// ── tests ──────────────────────────────────────────────────────────────
describe("AnalyzeCommand", () => {
  let state: ExtensionState;
  let ui: UiRefreshable;

  beforeEach(() => {
    state = new ExtensionState();
    ui = fakeUi();
  });

  describe("scope storage", () => {
    it("stores the scope in state when a folder analysis succeeds", async () => {
      const result = fakeResult();
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };
      const cmd = new AnalyzeCommand(
        async () => result,
        state,
        ui,
      );

      await cmd.execute(scope);

      expect(state.lastScope).toEqual(scope);
    });

    it("stores undefined scope for workspace-wide analysis", async () => {
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };
      const cmd = new AnalyzeCommand(
        async () => fakeResult(),
        state,
        ui,
      );
      // First do a folder analysis
      await cmd.execute(scope);
      expect(state.lastScope).toEqual(scope);

      // Then a workspace analysis should clear scope
      await cmd.execute();

      expect(state.lastScope).toBeUndefined();
    });
  });

  describe("refresh reuses last scope", () => {
    it("passes stored scope to runAnalysis when refresh calls execute without scope", async () => {
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };
      const runAnalysis = vi.fn(async () => fakeResult());
      const cmd = new AnalyzeCommand(runAnalysis, state, ui);

      // Analyze a folder
      await cmd.execute(scope);
      expect(runAnalysis).toHaveBeenLastCalledWith(
        expect.anything(),
        scope,
      );

      // Simulate refresh: pass state.lastScope (as register.ts should)
      await cmd.execute(state.lastScope);

      expect(runAnalysis).toHaveBeenLastCalledWith(
        expect.anything(),
        scope,
      );
      expect(runAnalysis).toHaveBeenCalledTimes(2);
    });
  });
});
