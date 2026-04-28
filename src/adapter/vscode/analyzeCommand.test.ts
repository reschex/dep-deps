import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { AnalysisScope } from "./configuration";
import { ExtensionState } from "./extensionState";
import type { UiRefreshable } from "./analyzeCommand";

// ── vscode mock ────────────────────────────────────────────────────────
vi.mock("vscode", () => {
  return {
    window: {
      withProgress: vi.fn(async (
        _opts: unknown,
        task: (progress: unknown, token: { isCancellationRequested: boolean }) => Promise<void>,
      ) => {
        await task({}, { isCancellationRequested: false });
      }),
    },
    ProgressLocation: { Notification: 15 },
    commands: { executeCommand: vi.fn() },
  };
});

// must be imported after vi.mock
const vscode = await import("vscode");
const { AnalyzeCommand } = await import("./analyzeCommand");

// ── helpers ────────────────────────────────────────────────────────────
function fakeResult(): AnalysisResult {
  return { symbols: [], fileRollup: new Map(), edges: [], edgesCount: 0 };
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
    vi.mocked(vscode.commands.executeCommand).mockClear();
    vi.mocked(vscode.window.withProgress).mockClear();
    // restore default implementation after tests that override it
    vi.mocked(vscode.window.withProgress).mockImplementation(async (
      _opts: unknown,
      task: (progress: unknown, token: { isCancellationRequested: boolean }) => Promise<void>,
    ) => {
      await task({}, { isCancellationRequested: false });
    });
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

  describe("debounce guard", () => {
    it("ignores a second call while the first is still in progress", async () => {
      let resolveProgress!: () => void;
      vi.mocked(vscode.window.withProgress).mockImplementationOnce(
        async (_opts, task) => {
          await (task as (p: unknown, t: { isCancellationRequested: boolean }) => Promise<void>)(
            {},
            { isCancellationRequested: false },
          );
          await new Promise<void>((r) => { resolveProgress = r; });
        },
      );

      const runAnalysis = vi.fn(async () => fakeResult());
      const cmd = new AnalyzeCommand(runAnalysis, state, ui);

      const first = cmd.execute();
      // yield so the first execute enters withProgress
      await Promise.resolve();

      await cmd.execute(); // should short-circuit

      expect(runAnalysis).toHaveBeenCalledTimes(1);
      resolveProgress();
      await first;
    });
  });

  describe("progress options", () => {
    it("shows notification with folder title when scope is provided", async () => {
      const scope: AnalysisScope = { rootUri: "file:///c%3A/code/src" };
      const cmd = new AnalyzeCommand(async () => fakeResult(), state, ui);

      await cmd.execute(scope);

      expect(vscode.window.withProgress).toHaveBeenCalledWith(
        { location: 15, title: "DDP: analyzing folder\u2026", cancellable: true },
        expect.any(Function),
      );
    });

    it("shows notification with workspace title when no scope", async () => {
      const cmd = new AnalyzeCommand(async () => fakeResult(), state, ui);

      await cmd.execute();

      expect(vscode.window.withProgress).toHaveBeenCalledWith(
        { location: 15, title: "DDP: analyzing workspace\u2026", cancellable: true },
        expect.any(Function),
      );
    });
  });

  describe("result handling", () => {
    it("does not store analysis when runAnalysis returns undefined", async () => {
      const cmd = new AnalyzeCommand(async () => undefined, state, ui);
      const spy = vi.spyOn(state, "setAnalysis");

      await cmd.execute();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("UI refresh", () => {
    it("calls all UI refresh methods", async () => {
      const cmd = new AnalyzeCommand(async () => fakeResult(), state, ui);

      await cmd.execute();

      expect(ui.refreshTree).toHaveBeenCalled();
      expect(ui.invalidateCodeLens).toHaveBeenCalled();
      expect(ui.applyDecorations).toHaveBeenCalled();
    });
  });
});
