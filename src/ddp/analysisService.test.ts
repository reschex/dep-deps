import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
vi.mock("vscode", () => ({
  window: {
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, def: unknown) => def),
    })),
    workspaceFolders: [{ uri: { toString: () => "file:///c%3A/code/proj" } }],
  },
}));

// ── Dependency mocks ─────────────────────────────────────────────────
vi.mock("./analysisOrchestrator", () => ({
  AnalysisOrchestrator: vi.fn(),
}));

vi.mock("./configuration", () => ({
  buildConfiguration: vi.fn(),
}));

vi.mock("../core/ccRegistry", () => ({
  CcProviderRegistry: vi.fn(),
}));

vi.mock("./coverageStore", () => ({
  CoverageStore: vi.fn(),
}));

vi.mock("./adapters", () => ({
  VsCodeDocumentProvider: vi.fn(),
  VsCodeSymbolProvider: vi.fn(),
  VsCodeCallGraphProvider: vi.fn(),
  VsCodeCoverageProvider: vi.fn(),
  EslintCcProvider: vi.fn(),
  RadonCcProvider: vi.fn(),
  PmdCcProvider: vi.fn(),
  VsCodeLogger: vi.fn(),
}));

vi.mock("./churn/gitChurnAdapter", () => ({
  GitChurnAdapter: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────
import * as vscode from "vscode";
import { AnalysisOrchestrator } from "./analysisOrchestrator";
import { buildConfiguration } from "./configuration";
import { CcProviderRegistry } from "../core/ccRegistry";
import { CoverageStore } from "./coverageStore";
import {
  VsCodeDocumentProvider,
  VsCodeSymbolProvider,
  VsCodeCallGraphProvider,
  VsCodeCoverageProvider,
  EslintCcProvider,
  RadonCcProvider,
  PmdCcProvider,
  VsCodeLogger,
} from "./adapters";
import { GitChurnAdapter } from "./churn/gitChurnAdapter";
import { AnalysisService } from "./analysisService";
import type { DdpConfiguration } from "./configuration";

// ── Test helpers ─────────────────────────────────────────────────────

const defaultTestConfig: DdpConfiguration = {
  coverage: { fallbackT: 0, lcovGlob: "**/coverage/lcov.info", jacocoGlob: "**/jacoco.xml" },
  rank: { maxIterations: 100, epsilon: 1e-6 },
  cc: {
    eslintPath: "eslint",
    pythonPath: "python",
    pmdPath: "pmd",
    useEslintForTsJs: true,
  },
  decoration: { warnThreshold: 50, errorThreshold: 150 },
  churn: { enabled: false, lookbackDays: 90 },
  fileRollup: "max",
  codelensEnabled: true,
  excludeTests: true,
};

function fakeToken(cancelled = false) {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: vi.fn(),
  } as unknown as vscode.CancellationToken;
}

// ── Shared mock state ────────────────────────────────────────────────

let mockOrchestratorAnalyze: ReturnType<typeof vi.fn>;
let mockRegistryRegister: ReturnType<typeof vi.fn>;
let mockCoverageStoreInstance: Record<string, unknown>;
let mockLoggerInstance: Record<string, unknown>;
let mockChannelInstance: Record<string, unknown>;

// ═════════════════════════════════════════════════════════════════════

describe("AnalysisService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrchestratorAnalyze = vi.fn().mockResolvedValue({
      symbols: [],
      fileRollup: new Map(),
      edgesCount: 0,
    });
    vi.mocked(AnalysisOrchestrator).mockImplementation(
      function () { return { analyze: mockOrchestratorAnalyze }; } as any,
    );

    mockRegistryRegister = vi.fn();
    vi.mocked(CcProviderRegistry).mockImplementation(
      function () { return { register: mockRegistryRegister }; } as any,
    );

    mockCoverageStoreInstance = {};
    vi.mocked(CoverageStore).mockImplementation(
      function () { return mockCoverageStoreInstance; } as any,
    );

    mockLoggerInstance = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(VsCodeLogger).mockImplementation(
      function () { return mockLoggerInstance; } as any,
    );

    mockChannelInstance = { appendLine: vi.fn() };
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue(
      mockChannelInstance as any,
    );

    vi.mocked(buildConfiguration).mockReturnValue({ ...defaultTestConfig });
  });

  // ─── Constructor ─────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates OutputChannel named 'DDP Risk'", () => {
      new AnalysisService();
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("DDP Risk");
    });

    it("constructs VsCodeLogger with the output channel", () => {
      new AnalysisService();
      expect(VsCodeLogger).toHaveBeenCalledWith(mockChannelInstance);
    });

    it("exposes a CoverageStore instance", () => {
      const service = new AnalysisService();
      expect(service.coverageStore).toBe(mockCoverageStoreInstance);
    });
  });

  // ─── Configuration ───────────────────────────────────────────────

  describe("configuration", () => {
    it("reads workspace configuration from 'ddp' section", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("ddp");
    });

    it("delegates configuration getter to rawConfig.get", async () => {
      const mockGet = vi.fn((_key: string, def: unknown) => def);
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: mockGet,
      } as any);

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const getter = vi.mocked(buildConfiguration).mock.calls[0][0];
      const result = getter("some.key", 42);
      expect(mockGet).toHaveBeenCalledWith("some.key", 42);
      expect(result).toBe(42);
    });

    it("passes built config to orchestrator.analyze", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const passedConfig = mockOrchestratorAnalyze.mock.calls[0][0];
      expect(passedConfig).toEqual(defaultTestConfig);
    });
  });

  // ─── CC Provider Registry ────────────────────────────────────────

  describe("CC provider registry", () => {
    it("registers ESLint provider for TS/JS when useEslintForTsJs is true", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(mockRegistryRegister).toHaveBeenCalledTimes(3);
      const eslintCall = mockRegistryRegister.mock.calls[0][0];
      expect(eslintCall.supportedLanguages).toEqual([
        "typescript",
        "javascript",
        "typescriptreact",
        "javascriptreact",
      ]);
    });

    it("skips ESLint registration when useEslintForTsJs is false", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        cc: { ...defaultTestConfig.cc, useEslintForTsJs: false },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(mockRegistryRegister).toHaveBeenCalledTimes(2);
      const languages = mockRegistryRegister.mock.calls.map(
        (c: unknown[]) => (c[0] as any).supportedLanguages,
      );
      expect(languages).toEqual([["python"], ["java"]]);
    });

    it("always registers Radon provider for Python", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const radonCall = mockRegistryRegister.mock.calls.find(
        (c: unknown[]) => (c[0] as any).supportedLanguages.includes("python"),
      );
      expect(radonCall).toBeDefined();
    });

    it("always registers PMD provider for Java", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const pmdCall = mockRegistryRegister.mock.calls.find(
        (c: unknown[]) => (c[0] as any).supportedLanguages.includes("java"),
      );
      expect(pmdCall).toBeDefined();
    });

    it("passes eslintPath to EslintCcProvider", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        cc: { ...defaultTestConfig.cc, eslintPath: "/custom/eslint" },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(EslintCcProvider).toHaveBeenCalledWith("/custom/eslint");
    });

    it("passes pythonPath to RadonCcProvider", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        cc: { ...defaultTestConfig.cc, pythonPath: "/custom/python" },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(RadonCcProvider).toHaveBeenCalledWith("/custom/python");
    });

    it("passes pmdPath to PmdCcProvider", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        cc: { ...defaultTestConfig.cc, pmdPath: "/custom/pmd" },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(PmdCcProvider).toHaveBeenCalledWith("/custom/pmd");
    });
  });

  // ─── Adapter Wiring ──────────────────────────────────────────────

  describe("adapter wiring", () => {
    it("passes excludeTests to VsCodeDocumentProvider", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        excludeTests: false,
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(VsCodeDocumentProvider).toHaveBeenCalledWith(false);
    });

    it("passes token and excludeTests to VsCodeCallGraphProvider", async () => {
      const token = fakeToken();

      const service = new AnalysisService();
      await service.analyze(token);

      expect(VsCodeCallGraphProvider).toHaveBeenCalledWith(token, true);
    });

    it("passes coverageStore, lcovGlob, jacocoGlob, and token to VsCodeCoverageProvider", async () => {
      const token = fakeToken();
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        coverage: { ...defaultTestConfig.coverage, lcovGlob: "custom/**/lcov.info", jacocoGlob: "custom/**/jacoco.xml" },
      });

      const service = new AnalysisService();
      await service.analyze(token);

      expect(VsCodeCoverageProvider).toHaveBeenCalledWith(
        mockCoverageStoreInstance,
        "custom/**/lcov.info",
        "custom/**/jacoco.xml",
        token,
      );
    });

    it("passes logger to orchestrator deps", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const deps = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
      expect(deps.logger).toBe(mockLoggerInstance);
    });

    it("passes ccRegistry to orchestrator deps", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const deps = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
      expect(deps.ccRegistry.register).toBe(mockRegistryRegister);
    });
  });

  // ─── Scope Forwarding ───────────────────────────────────────────

  describe("scope forwarding", () => {
    it("forwards undefined scope to orchestrator.analyze", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const passedScope = mockOrchestratorAnalyze.mock.calls[0][2];
      expect(passedScope).toBeUndefined();
    });

    it("forwards scope object to orchestrator.analyze", async () => {
      const scope = { rootUri: "file:///my/project/src" };

      const service = new AnalysisService();
      await service.analyze(fakeToken(), scope);

      const passedScope = mockOrchestratorAnalyze.mock.calls[0][2];
      expect(passedScope).toEqual({ rootUri: "file:///my/project/src" });
    });
  });

  // ─── Cancellation Forwarding ────────────────────────────────────

  describe("cancellation forwarding", () => {
    it("delegates isCancelled to token.isCancellationRequested", async () => {
      const token = fakeToken(false);

      const service = new AnalysisService();
      await service.analyze(token);

      const ctx = mockOrchestratorAnalyze.mock.calls[0][1];
      expect(ctx.isCancelled()).toBe(false);
    });

    it("reflects dynamic cancellation state changes", async () => {
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      const service = new AnalysisService();
      await service.analyze(token);

      const ctx = mockOrchestratorAnalyze.mock.calls[0][1];
      expect(ctx.isCancelled()).toBe(false);

      (token as any).isCancellationRequested = true;
      expect(ctx.isCancelled()).toBe(true);
    });
  });

  // ─── Return Value ───────────────────────────────────────────────

  describe("return value", () => {
    it("returns analysis result from orchestrator", async () => {
      const expected = {
        symbols: [{ id: "x" }],
        fileRollup: new Map([["a", 1]]),
        edgesCount: 5,
      };
      mockOrchestratorAnalyze.mockResolvedValue(expected);

      const service = new AnalysisService();
      const result = await service.analyze(fakeToken());

      expect(result).toBe(expected);
    });

    it("returns undefined when orchestrator returns undefined", async () => {
      mockOrchestratorAnalyze.mockResolvedValue(undefined);

      const service = new AnalysisService();
      const result = await service.analyze(fakeToken());

      expect(result).toBeUndefined();
    });
  });

  // ─── bugmagnet session 2026-04-16 ───────────────────────────────

  describe("bugmagnet session 2026-04-16", () => {
    // ── Stateful operations ──────────────────────────────────────

    describe("stateful operations", () => {
      it("creates a new orchestrator on each analyze call", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        expect(AnalysisOrchestrator).toHaveBeenCalledTimes(2);
      });

      it("creates a new CcProviderRegistry on each analyze call", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        expect(CcProviderRegistry).toHaveBeenCalledTimes(2);
      });

      it("reuses the same coverageStore instance across analyze calls", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        const _deps1 = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
        const _deps2 = vi.mocked(AnalysisOrchestrator).mock.calls[1][0] as any;
        // Both calls receive the VsCodeCoverageProvider constructed with the same store
        expect(VsCodeCoverageProvider).toHaveBeenCalledTimes(2);
        const store1 = vi.mocked(VsCodeCoverageProvider).mock.calls[0][0];
        const store2 = vi.mocked(VsCodeCoverageProvider).mock.calls[1][0];
        expect(store1).toBe(store2);
      });

      it("reuses the same logger instance across analyze calls", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        const deps1 = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
        const deps2 = vi.mocked(AnalysisOrchestrator).mock.calls[1][0] as any;
        expect(deps1.logger).toBe(deps2.logger);
      });

      it("reads fresh configuration on each analyze call", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(2);
        expect(buildConfiguration).toHaveBeenCalledTimes(2);
      });

      it("uses different tokens on successive calls", async () => {
        const token1 = fakeToken(false);
        const token2 = fakeToken(true);

        const service = new AnalysisService();
        await service.analyze(token1);
        await service.analyze(token2);

        expect(VsCodeCallGraphProvider).toHaveBeenNthCalledWith(1, token1, true);
        expect(VsCodeCallGraphProvider).toHaveBeenNthCalledWith(2, token2, true);
      });

      it("passes different scopes on successive calls", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken(), { rootUri: "file:///a" });
        await service.analyze(fakeToken());

        expect(mockOrchestratorAnalyze.mock.calls[0][2]).toEqual({ rootUri: "file:///a" });
        expect(mockOrchestratorAnalyze.mock.calls[1][2]).toBeUndefined();
      });
    });

    // ── Error handling ───────────────────────────────────────────

    describe("error handling", () => {
      it("propagates error when orchestrator.analyze rejects", async () => {
        mockOrchestratorAnalyze.mockRejectedValue(new Error("analysis boom"));

        const service = new AnalysisService();
        await expect(service.analyze(fakeToken())).rejects.toThrow("analysis boom");
      });

      it("propagates error when buildConfiguration throws", async () => {
        vi.mocked(buildConfiguration).mockImplementation(() => {
          throw new Error("config boom");
        });

        const service = new AnalysisService();
        await expect(service.analyze(fakeToken())).rejects.toThrow("config boom");
      });

      it("propagates error when getConfiguration throws", async () => {
        vi.mocked(vscode.workspace.getConfiguration).mockImplementationOnce(() => {
          throw new Error("workspace boom");
        });

        const service = new AnalysisService();
        await expect(service.analyze(fakeToken())).rejects.toThrow("workspace boom");
      });
    });

    // ── Complex interactions ─────────────────────────────────────

    describe("complex interactions", () => {
      it("registers ESLint first, then Radon, then PMD when useEslintForTsJs is true", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());

        expect(mockRegistryRegister).toHaveBeenCalledTimes(3);
        const langs = mockRegistryRegister.mock.calls.map(
          (c: unknown[]) => (c[0] as any).supportedLanguages,
        );
        expect(langs[0]).toEqual(["typescript", "javascript", "typescriptreact", "javascriptreact"]);
        expect(langs[1]).toEqual(["python"]);
        expect(langs[2]).toEqual(["java"]);
      });

      it("registers Radon first, then PMD when useEslintForTsJs is false", async () => {
        vi.mocked(buildConfiguration).mockReturnValue({
          ...defaultTestConfig,
          cc: { ...defaultTestConfig.cc, useEslintForTsJs: false },
        });

        const service = new AnalysisService();
        await service.analyze(fakeToken());

        expect(mockRegistryRegister).toHaveBeenCalledTimes(2);
        const langs = mockRegistryRegister.mock.calls.map(
          (c: unknown[]) => (c[0] as any).supportedLanguages,
        );
        expect(langs[0]).toEqual(["python"]);
        expect(langs[1]).toEqual(["java"]);
      });

      it("config changes between calls affects ESLint registration", async () => {
        vi.mocked(buildConfiguration)
          .mockReturnValueOnce({ ...defaultTestConfig, cc: { ...defaultTestConfig.cc, useEslintForTsJs: true } })
          .mockReturnValueOnce({ ...defaultTestConfig, cc: { ...defaultTestConfig.cc, useEslintForTsJs: false } });

        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        // First call: 3 registrations (eslint + radon + pmd)
        // Second call: 2 registrations (radon + pmd)
        expect(mockRegistryRegister).toHaveBeenCalledTimes(5);
      });

      it("constructs all adapter instances fresh per analyze call", async () => {
        const service = new AnalysisService();
        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        expect(VsCodeDocumentProvider).toHaveBeenCalledTimes(2);
        expect(VsCodeSymbolProvider).toHaveBeenCalledTimes(2);
        expect(VsCodeCallGraphProvider).toHaveBeenCalledTimes(2);
        expect(VsCodeCoverageProvider).toHaveBeenCalledTimes(2);
      });

      it("does not construct OutputChannel or Logger on analyze — only in constructor", async () => {
        vi.clearAllMocks();
        // Re-apply constructor mocks after clearAllMocks
        vi.mocked(CoverageStore).mockImplementation(
          function () { return mockCoverageStoreInstance; } as any,
        );
        vi.mocked(VsCodeLogger).mockImplementation(
          function () { return mockLoggerInstance; } as any,
        );
        vi.mocked(vscode.window.createOutputChannel).mockReturnValue(
          mockChannelInstance as any,
        );

        const service = new AnalysisService();
        expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
        expect(VsCodeLogger).toHaveBeenCalledTimes(1);

        // Re-apply analyze mocks
        mockOrchestratorAnalyze = vi.fn().mockResolvedValue({
          symbols: [], fileRollup: new Map(), edgesCount: 0,
        });
        vi.mocked(AnalysisOrchestrator).mockImplementation(
          function () { return { analyze: mockOrchestratorAnalyze }; } as any,
        );
        mockRegistryRegister = vi.fn();
        vi.mocked(CcProviderRegistry).mockImplementation(
          function () { return { register: mockRegistryRegister }; } as any,
        );
        vi.mocked(buildConfiguration).mockReturnValue({ ...defaultTestConfig });

        await service.analyze(fakeToken());
        await service.analyze(fakeToken());

        // Still only 1 of each from the constructor
        expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
        expect(VsCodeLogger).toHaveBeenCalledTimes(1);
      });
    });

    // ── Configuration edge cases ─────────────────────────────────

    describe("configuration edge cases", () => {
      it("passes empty string cc paths to providers", async () => {
        vi.mocked(buildConfiguration).mockReturnValue({
          ...defaultTestConfig,
          cc: { eslintPath: "", pythonPath: "", pmdPath: "", useEslintForTsJs: true },
        });

        const service = new AnalysisService();
        await service.analyze(fakeToken());

        expect(EslintCcProvider).toHaveBeenCalledWith("");
        expect(RadonCcProvider).toHaveBeenCalledWith("");
        expect(PmdCcProvider).toHaveBeenCalledWith("");
      });

      it("passes paths with spaces to providers", async () => {
        vi.mocked(buildConfiguration).mockReturnValue({
          ...defaultTestConfig,
          cc: {
            eslintPath: "/path with spaces/eslint",
            pythonPath: "C:\\Program Files\\Python\\python",
            pmdPath: "/usr/local/pmd tool/pmd",
            useEslintForTsJs: true,
          },
        });

        const service = new AnalysisService();
        await service.analyze(fakeToken());

        expect(EslintCcProvider).toHaveBeenCalledWith("/path with spaces/eslint");
        expect(RadonCcProvider).toHaveBeenCalledWith("C:\\Program Files\\Python\\python");
        expect(PmdCcProvider).toHaveBeenCalledWith("/usr/local/pmd tool/pmd");
      });

      it("passes empty lcovGlob to coverage provider", async () => {
        vi.mocked(buildConfiguration).mockReturnValue({
          ...defaultTestConfig,
          coverage: { ...defaultTestConfig.coverage, lcovGlob: "" },
        });

        const service = new AnalysisService();
        const token = fakeToken();
        await service.analyze(token);

        expect(VsCodeCoverageProvider).toHaveBeenCalledWith(
          mockCoverageStoreInstance, "", defaultTestConfig.coverage.jacocoGlob, token,
        );
      });
    });

    // ── Cancellation edge cases ──────────────────────────────────

    describe("cancellation edge cases", () => {
      it("passes already-cancelled token to orchestrator", async () => {
        const token = fakeToken(true);

        const service = new AnalysisService();
        await service.analyze(token);

        const ctx = mockOrchestratorAnalyze.mock.calls[0][1];
        expect(ctx.isCancelled()).toBe(true);
      });

      it("passes already-cancelled token to VsCodeCallGraphProvider", async () => {
        const token = fakeToken(true);

        const service = new AnalysisService();
        await service.analyze(token);

        expect(VsCodeCallGraphProvider).toHaveBeenCalledWith(token, true);
      });

      it("passes already-cancelled token to VsCodeCoverageProvider", async () => {
        const token = fakeToken(true);

        const service = new AnalysisService();
        await service.analyze(token);

        expect(VsCodeCoverageProvider).toHaveBeenCalledWith(
          mockCoverageStoreInstance,
          defaultTestConfig.coverage.lcovGlob,
          defaultTestConfig.coverage.jacocoGlob,
          token,
        );
      });
    });
  });

  // ─── Churn adapter wiring ────────────────────────────────────────
  describe("churn adapter wiring", () => {
    let savedWorkspaceFolders: unknown;

    afterEach(async () => {
      if (savedWorkspaceFolders !== undefined) {
        const vscodeModule = await import("vscode");
        (vscodeModule.workspace as any).workspaceFolders = savedWorkspaceFolders;
        savedWorkspaceFolders = undefined;
      }
    });

    it("does not create GitChurnAdapter when churn is disabled", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        churn: { enabled: false, lookbackDays: 90 },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(GitChurnAdapter).not.toHaveBeenCalled();
    });

    it("creates GitChurnAdapter with workspace root URI when churn is enabled", async () => {
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        churn: { enabled: true, lookbackDays: 90 },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      expect(GitChurnAdapter).toHaveBeenCalledWith("file:///c%3A/code/proj");
    });

    it("passes GitChurnAdapter instance to orchestrator deps when churn is enabled", async () => {
      const fakeChurnInstance = {};
      vi.mocked(GitChurnAdapter).mockImplementation(function () { return fakeChurnInstance; } as any);
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        churn: { enabled: true, lookbackDays: 90 },
      });

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const deps = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
      expect(deps.churnProvider).toBe(fakeChurnInstance);
    });

    it("passes undefined churnProvider to orchestrator when churn is disabled", async () => {
      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const deps = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
      expect(deps.churnProvider).toBeUndefined();
    });

    it("passes undefined churnProvider when no workspace folders are open", async () => {
      const vscodeModule = await import("vscode");
      savedWorkspaceFolders = (vscodeModule.workspace as any).workspaceFolders;
      vi.mocked(buildConfiguration).mockReturnValue({
        ...defaultTestConfig,
        churn: { enabled: true, lookbackDays: 90 },
      });
      (vscodeModule.workspace as any).workspaceFolders = undefined;

      const service = new AnalysisService();
      await service.analyze(fakeToken());

      const deps = vi.mocked(AnalysisOrchestrator).mock.calls[0][0] as any;
      expect(deps.churnProvider).toBeUndefined();
    });
  });
});
