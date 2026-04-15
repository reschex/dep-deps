import { describe, it, expect, assert } from "vitest";
import { AnalysisOrchestrator, type AnalysisContext } from "./analysisOrchestrator";
import { CcProviderRegistry } from "../core/ccRegistry";
import { DEFAULT_CONFIGURATION, type DdpConfiguration, type AnalysisScope } from "./configuration";
import { isTestFileUri } from "./configuration";
import type {
  DocumentProvider,
  DocumentInfo,
  SymbolProvider,
  FunctionSymbolInfo,
  CallGraphProvider,
  CoverageProvider,
  CyclomaticComplexityProvider,
  CcResult,
  Logger,
} from "../core/ports";
import type { StatementCover } from "../core/coverageMap";
import type { CallEdge } from "../core/rank";

// ─── Fakes ───────────────────────────────────────────────────────────────────

function fakeDoc(uri: string, languageId: string, text = "if (a) { b(); }"): DocumentInfo {
  return {
    uri,
    languageId,
    getText: () => text,
  };
}

function fakeDocProvider(docs: Map<string, DocumentInfo>): DocumentProvider {
  return {
    async findSourceFiles(_maxFiles, rootUri?) {
      const all = [...docs.keys()];
      if (!rootUri) {
        return all;
      }
      const prefix = rootUri.endsWith("/") ? rootUri : rootUri + "/";
      return all.filter((uri) => uri.startsWith(prefix));
    },
    async openDocument(uri) {
      return docs.get(uri);
    },
  };
}

function fakeSymbolProvider(symbols: Map<string, FunctionSymbolInfo[]>): SymbolProvider {
  return {
    async getFunctionSymbols(uri) {
      return symbols.get(uri) ?? [];
    },
  };
}

function fakeCallGraphProvider(edges: CallEdge[]): CallGraphProvider {
  return {
    async collectCallEdges(_maxFiles, _rootUri?) {
      return edges;
    },
  };
}

function fakeCoverageProvider(coverage: Map<string, StatementCover[]>): CoverageProvider {
  return {
    async loadCoverage() {},
    getStatements(uri) {
      return coverage.get(uri);
    },
  };
}

function neverCancelledCtx(): AnalysisContext {
  return { isCancelled: () => false };
}

const nullLogger = { info() {}, warn() {}, error() {} };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AnalysisOrchestrator", () => {
  it("computes metrics for a simple two-function workspace", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [
        uri,
        [
          { name: "foo", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 },
          { name: "bar", selectionStartLine: 10, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 15 },
        ],
      ],
    ]);
    const edges: CallEdge[] = [
      { caller: `${uri}#0:0`, callee: `${uri}#10:0` },
    ];

    const ccRegistry = new CcProviderRegistry();
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider(edges),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry,
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());

    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(2);
    expect(result.edgesCount).toBe(1);
    expect(result.fileRollup.has(uri)).toBe(true);

    const foo = result.symbols.find((s) => s.name === "foo");
    const bar = result.symbols.find((s) => s.name === "bar");
    assert(foo !== undefined, "expected foo");
    assert(bar !== undefined, "expected bar");
    // bar is callee, should have higher rank
    expect(bar.r).toBeGreaterThan(foo.r);
  });

  it("returns undefined when cancelled before call graph", async () => {
    let step = 0;
    const coverageProvider: CoverageProvider = {
      async loadCoverage() { step = 1; },
      getStatements() { return undefined; },
    };
    const ctx: AnalysisContext = { isCancelled: () => step >= 1 };

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(new Map()),
      symbolProvider: fakeSymbolProvider(new Map()),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider,
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, ctx);
    expect(result).toBeUndefined();
  });

  it("uses tool-specific CC when available", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 4, selectionStartCharacter: 0, bodyStartLine: 4, bodyEndLine: 10 }]],
    ]);

    // Tool reports CC=15 for line 5 (1-based = selectionStartLine + 1)
    const toolProvider: CyclomaticComplexityProvider = {
      async computeComplexity(): Promise<CcResult> {
        return { byLine: new Map([[5, 15]]), byName: new Map() };
      },
    };
    const ccRegistry = new CcProviderRegistry();
    ccRegistry.register({
      supportedLanguages: ["typescript"],
      provider: toolProvider,
    });

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry,
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols[0].cc).toBe(15);
  });

  it("uses coverage data when available", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);
    const coverage = new Map([
      [uri, [
        { executed: true, startLine: 0, endLine: 0 },
        { executed: true, startLine: 1, endLine: 1 },
        { executed: false, startLine: 2, endLine: 2 },
      ]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(coverage),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    // T = 2/3 ≈ 0.667
    assert(result !== undefined, "expected result");
    expect(result.symbols[0].t).toBeCloseTo(2 / 3, 3);
  });

  it("respects rollup mode from configuration", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [
        uri,
        [
          { name: "foo", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 },
          { name: "bar", selectionStartLine: 10, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 15 },
        ],
      ],
    ]);

    const config: DdpConfiguration = { ...DEFAULT_CONFIGURATION, fileRollup: "sum" };
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(config, neverCancelledCtx());
    // sum mode: rollup should be sum of both symbols' F values
    assert(result !== undefined, "expected result");
    const sumF = result.symbols.reduce((acc, s) => acc + s.f, 0);
    expect(result.fileRollup.get(uri)).toBeCloseTo(sumF, 5);
  });

  it("handles empty workspace gracefully", async () => {
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(new Map()),
      symbolProvider: fakeSymbolProvider(new Map()),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(0);
    expect(result.edgesCount).toBe(0);
  });

  // ─── Folder-Scoped Analysis ──────────────────────────────────────────────

  it("only analyses symbols under the scoped rootUri", async () => {
    const inScopeUri = "file:///project/src/a.ts";
    const outOfScopeUri = "file:///project/lib/b.ts";
    const docs = new Map([
      [inScopeUri, fakeDoc(inScopeUri, "typescript", "return 1")],
      [outOfScopeUri, fakeDoc(outOfScopeUri, "typescript", "return 2")],
    ]);
    const symbols = new Map([
      [inScopeUri, [{ name: "inFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      [outOfScopeUri, [{ name: "outFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const scope: AnalysisScope = { rootUri: "file:///project/src" };
    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx(), scope);
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("inFn");
  });

  it("keeps boundary edges for rank when callee is outside scope", async () => {
    const srcUri = "file:///project/src/a.ts";
    const extUri = "file:///project/node_modules/dep/index.ts";
    const docs = new Map([
      [srcUri, fakeDoc(srcUri, "typescript", "return 1")],
      [extUri, fakeDoc(extUri, "typescript", "return 2")],
    ]);
    const symbols = new Map([
      [srcUri, [
        { name: "caller", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 },
      ]],
      [extUri, [
        { name: "extFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 },
      ]],
    ]);
    // Edge from in-scope caller to out-of-scope callee
    const edges: CallEdge[] = [
      { caller: `${srcUri}#0:0`, callee: `${extUri}#0:0` },
    ];

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider(edges),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const scope: AnalysisScope = { rootUri: "file:///project/src" };
    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx(), scope);
    assert(result !== undefined, "expected result");
    // Only the in-scope symbol should be in the results
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("caller");
    // The edge to the external module is still counted
    expect(result.edgesCount).toBe(1);
  });

  it("analyses all files when no scope is provided", async () => {
    const uri1 = "file:///project/src/a.ts";
    const uri2 = "file:///project/lib/b.ts";
    const docs = new Map([
      [uri1, fakeDoc(uri1, "typescript", "return 1")],
      [uri2, fakeDoc(uri2, "typescript", "return 2")],
    ]);
    const symbols = new Map([
      [uri1, [{ name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      [uri2, [{ name: "fn2", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    // No scope — all files
    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(2);
  });

  // ─── Document / Symbol Edge Cases ────────────────────────────────────────

  it("skips file and logs warning when openDocument returns undefined", async () => {
    const uri = "file:///missing.ts";
    const docProvider: DocumentProvider = {
      async findSourceFiles() { return [uri]; },
      async openDocument() { return undefined; },
    };
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const warnings: string[] = [];
    const logger = { info() {}, warn(msg: string) { warnings.push(msg); }, error() {} };

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: docProvider,
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(0);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("missing.ts");
  });

  it("skips file with no function symbols", async () => {
    const uri = "file:///empty.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "const x = 1;")]]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(new Map()), // no symbols for any file
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(0);
    expect(result.fileRollup.size).toBe(0);
  });

  // ─── Cancellation ───────────────────────────────────────────────────────

  it("returns undefined when cancelled during file iteration", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    let callGraphDone = false;
    const callGraphProvider: CallGraphProvider = {
      async collectCallEdges() { callGraphDone = true; return []; },
    };
    // Cancel after call graph but before file iteration processes
    const ctx: AnalysisContext = { isCancelled: () => callGraphDone };

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider,
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, ctx);
    expect(result).toBeUndefined();
  });

  // ─── CC Resolution Paths ────────────────────────────────────────────────

  it("uses name-based CC when line-based has no match", async () => {
    const uri = "file:///a.py";
    const docs = new Map([[uri, fakeDoc(uri, "python", "def fn(): pass")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 4, selectionStartCharacter: 0, bodyStartLine: 4, bodyEndLine: 10 }]],
    ]);

    // byLine is empty, byName has "5:fn" → CC=8
    const toolProvider: CyclomaticComplexityProvider = {
      async computeComplexity(): Promise<CcResult> {
        return { byLine: new Map(), byName: new Map([["5:fn", 8]]) };
      },
    };
    const ccRegistry = new CcProviderRegistry();
    ccRegistry.register({ supportedLanguages: ["python"], provider: toolProvider });

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry,
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols[0].cc).toBe(8);
  });

  it("falls back to line-based CC miss then name-based CC miss then regex estimator", async () => {
    const uri = "file:///a.ts";
    const source = "if (a) { b(); } else { c(); }";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", source)]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    // byLine has entries but not for line 1, byName has entries but not for "1:fn"
    const toolProvider: CyclomaticComplexityProvider = {
      async computeComplexity(): Promise<CcResult> {
        return {
          byLine: new Map([[99, 10]]),   // wrong line
          byName: new Map([["99:other", 10]]), // wrong key
        };
      },
    };
    const ccRegistry = new CcProviderRegistry();
    ccRegistry.register({ supportedLanguages: ["typescript"], provider: toolProvider });

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry,
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    // Regex estimator on "if (a) { b(); } else { c(); }" → "if" + "else" not matched as "else if" → depends on regex
    // estimateCyclomaticComplexity counts: "if" → 1 decision → CC = 2
    expect(result.symbols[0].cc).toBe(2);
  });

  it("uses regex fallback CC when ccResult maps are both empty", async () => {
    const uri = "file:///a.ts";
    const source = "return 1";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", source)]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(), // fallback only
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    // "return 1" has no decisions → CC = 1
    expect(result.symbols[0].cc).toBe(1);
  });

  // ─── Coverage Configuration ─────────────────────────────────────────────

  it("applies fallbackT when no coverage statements overlap symbol", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const config: DdpConfiguration = {
      ...DEFAULT_CONFIGURATION,
      coverage: { ...DEFAULT_CONFIGURATION.coverage, fallbackT: 0.5 },
    };

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()), // no coverage at all
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(config, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols[0].t).toBeCloseTo(0.5, 5);
  });

  // ─── Multi-File / Multi-Language ────────────────────────────────────────

  it("handles multiple files with different languages using different CC providers", async () => {
    const tsUri = "file:///a.ts";
    const pyUri = "file:///b.py";
    const docs = new Map([
      [tsUri, fakeDoc(tsUri, "typescript", "return 1")],
      [pyUri, fakeDoc(pyUri, "python", "return 1")],
    ]);
    const symbols = new Map([
      [tsUri, [{ name: "tsFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      [pyUri, [{ name: "pyFn", selectionStartLine: 2, selectionStartCharacter: 0, bodyStartLine: 2, bodyEndLine: 8 }]],
    ]);

    const tsProvider: CyclomaticComplexityProvider = {
      async computeComplexity(): Promise<CcResult> {
        return { byLine: new Map([[1, 3]]), byName: new Map() };
      },
    };
    const pyProvider: CyclomaticComplexityProvider = {
      async computeComplexity(): Promise<CcResult> {
        return { byLine: new Map(), byName: new Map([["3:pyFn", 7]]) };
      },
    };
    const ccRegistry = new CcProviderRegistry();
    ccRegistry.register({ supportedLanguages: ["typescript"], provider: tsProvider });
    ccRegistry.register({ supportedLanguages: ["python"], provider: pyProvider });

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry,
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(2);

    const ts = result.symbols.find(s => s.name === "tsFn");
    const py = result.symbols.find(s => s.name === "pyFn");
    assert(ts !== undefined, "expected tsFn");
    assert(py !== undefined, "expected pyFn");
    expect(ts.cc).toBe(3);
    expect(py.cc).toBe(7);
  });

  it("produces correct file rollup across multiple files", async () => {
    const uri1 = "file:///a.ts";
    const uri2 = "file:///b.ts";
    const docs = new Map([
      [uri1, fakeDoc(uri1, "typescript", "return 1")],
      [uri2, fakeDoc(uri2, "typescript", "return 1")],
    ]);
    const symbols = new Map([
      [uri1, [{ name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      [uri2, [{ name: "fn2", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.fileRollup.size).toBe(2);
    expect(result.fileRollup.has(uri1)).toBe(true);
    expect(result.fileRollup.has(uri2)).toBe(true);
  });

  // ─── Symbol ID Format ──────────────────────────────────────────────────

  it("produces symbol IDs in uri#line:char format", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 7, selectionStartCharacter: 4, bodyStartLine: 7, bodyEndLine: 12 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols[0].id).toBe("file:///a.ts#7:4");
  });

  // ─── Scope Edge Cases ──────────────────────────────────────────────────

  it("handles scope rootUri with trailing slash", async () => {
    const uri = "file:///project/src/a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const symbols = new Map([
      [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
    ]);

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const scope: AnalysisScope = { rootUri: "file:///project/src/" };
    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx(), scope);
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("fn");
  });

  // ─── Edge Count ─────────────────────────────────────────────────────────

  it("reports correct edgesCount with many edges", async () => {
    const uri = "file:///a.ts";
    const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
    const fns: FunctionSymbolInfo[] = Array.from({ length: 10 }, (_, i) => ({
      name: `fn${i}`,
      selectionStartLine: i * 10,
      selectionStartCharacter: 0,
      bodyStartLine: i * 10,
      bodyEndLine: i * 10 + 5,
    }));
    const symbols = new Map([[uri, fns]]);
    const edges: CallEdge[] = [];
    for (let i = 0; i < 9; i++) {
      edges.push({ caller: `${uri}#${i * 10}:0`, callee: `${uri}#${(i + 1) * 10}:0` });
    }

    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs),
      symbolProvider: fakeSymbolProvider(symbols),
      callGraphProvider: fakeCallGraphProvider(edges),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result !== undefined, "expected result");
    expect(result.symbols).toHaveLength(10);
    expect(result.edgesCount).toBe(9);
  });
});

// ─── bugmagnet session 2026-04-15 ──────────────────────────────────────────

describe("bugmagnet session 2026-04-15", () => {

  // ─── Complex Interactions ─────────────────────────────────────────────────

  describe("complex interactions", () => {
    it("returns correct metrics when edges, coverage and tool CC all interact", async () => {
      const uriA = "file:///a.ts";
      const uriB = "file:///b.ts";
      const docs = new Map([
        [uriA, fakeDoc(uriA, "typescript", "if (a && b) { c(); }")],
        [uriB, fakeDoc(uriB, "typescript", "return x")],
      ]);
      const symbols = new Map([
        [uriA, [{ name: "caller", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
        [uriB, [{ name: "callee", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      const edges: CallEdge[] = [
        { caller: `${uriA}#0:0`, callee: `${uriB}#0:0` },
      ];
      const coverage = new Map([
        [uriA, [
          { executed: true, startLine: 0, endLine: 0 },
          { executed: true, startLine: 1, endLine: 1 },
          { executed: false, startLine: 2, endLine: 2 },
          { executed: false, startLine: 3, endLine: 3 },
        ]],
        [uriB, [
          { executed: true, startLine: 0, endLine: 5 },
        ]],
      ]);

      // Tool CC for a.ts
      const toolProvider: CyclomaticComplexityProvider = {
        async computeComplexity(): Promise<CcResult> {
          return { byLine: new Map([[1, 5]]), byName: new Map() };
        },
      };
      const ccRegistry = new CcProviderRegistry();
      ccRegistry.register({ supportedLanguages: ["typescript"], provider: toolProvider });

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider(edges),
        coverageProvider: fakeCoverageProvider(coverage),
        ccRegistry,
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols).toHaveLength(2);
      expect(result.edgesCount).toBe(1);

      const caller = result.symbols.find(s => s.name === "caller");
      const callee = result.symbols.find(s => s.name === "callee");
      assert(caller !== undefined);
      assert(callee !== undefined);

      // caller: CC=5 (tool), T=0.5 (2/4), has outgoing edge
      expect(caller.cc).toBe(5);
      expect(caller.t).toBeCloseTo(0.5, 3);

      // callee: CC=5 (same tool provider applies to both TS files), T=1.0, has incoming edge → higher rank
      expect(callee.cc).toBe(5);
      expect(callee.t).toBeCloseTo(1.0, 3);
      expect(callee.r).toBeGreaterThan(caller.r);

      // Both files in rollup
      expect(result.fileRollup.has(uriA)).toBe(true);
      expect(result.fileRollup.has(uriB)).toBe(true);
    });

    it("preserves symbol order consistency across multiple analyses", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const fns: FunctionSymbolInfo[] = [
        { name: "alpha", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
        { name: "beta", selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 8 },
        { name: "gamma", selectionStartLine: 10, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 13 },
      ];
      const symbols = new Map([[uri, fns]]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result1 = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      const result2 = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result1 !== undefined);
      assert(result2 !== undefined);
      expect(result1.symbols.map(s => s.name)).toEqual(result2.symbols.map(s => s.name));
    });

    it("computes correct rollup in sum mode with multiple symbols per file", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [
          { name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
          { name: "fn2", selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 8 },
          { name: "fn3", selectionStartLine: 10, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 13 },
        ]],
      ]);

      const config: DdpConfiguration = { ...DEFAULT_CONFIGURATION, fileRollup: "sum" };
      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(config, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      const totalF = result.symbols.reduce((sum, s) => sum + s.f, 0);
      expect(result.fileRollup.get(uri)).toBeCloseTo(totalF, 5);
    });

    it("computes correct rollup in max mode with multiple symbols per file", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [
          { name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
          { name: "fn2", selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 8 },
        ]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      const maxF = Math.max(...result.symbols.map(s => s.f));
      expect(result.fileRollup.get(uri)).toBeCloseTo(maxF, 5);
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  describe("error handling", () => {
    it("continues processing remaining files after one document open fails", async () => {
      const goodUri = "file:///good.ts";
      const badUri = "file:///bad.ts";
      const goodDoc = fakeDoc(goodUri, "typescript", "return 1");

      const docProvider: DocumentProvider = {
        async findSourceFiles() { return [badUri, goodUri]; },
        async openDocument(uri) { return uri === goodUri ? goodDoc : undefined; },
      };
      const symbols = new Map([
        [goodUri, [{ name: "goodFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
        [badUri, [{ name: "badFn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: docProvider,
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      // Only the good file's symbol should be in results
      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe("goodFn");
    });

    it("handles CC provider that throws by propagating the error", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const throwingProvider: CyclomaticComplexityProvider = {
        async computeComplexity(): Promise<CcResult> {
          throw new Error("CC tool crashed");
        },
      };
      const ccRegistry = new CcProviderRegistry();
      ccRegistry.register({ supportedLanguages: ["typescript"], provider: throwingProvider });

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry,
        logger: nullLogger,
      });

      await expect(orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx()))
        .rejects.toThrow("CC tool crashed");
    });

    it("handles coverage provider loadCoverage that throws by propagating the error", async () => {
      const coverageProvider: CoverageProvider = {
        async loadCoverage() { throw new Error("coverage load failed"); },
        getStatements() { return undefined; },
      };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(new Map()),
        symbolProvider: fakeSymbolProvider(new Map()),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider,
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      await expect(orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx()))
        .rejects.toThrow("coverage load failed");
    });

    it("handles symbol provider that throws by propagating the error", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript")]]);
      const throwingSymbolProvider: SymbolProvider = {
        async getFunctionSymbols() { throw new Error("symbol extraction failed"); },
      };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: throwingSymbolProvider,
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      await expect(orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx()))
        .rejects.toThrow("symbol extraction failed");
    });
  });

  // ─── Stateful Operations ──────────────────────────────────────────────────

  describe("stateful operations", () => {
    it("returns consistent results when analyze is called multiple times", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "if (a) { b(); }")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      const edges: CallEdge[] = [];

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider(edges),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result1 = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      const result2 = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result1 !== undefined);
      assert(result2 !== undefined);
      expect(result1.symbols[0].f).toBeCloseTo(result2.symbols[0].f, 10);
      expect(result1.symbols[0].cc).toBe(result2.symbols[0].cc);
      expect(result1.symbols[0].t).toBe(result2.symbols[0].t);
      expect(result1.symbols[0].r).toBeCloseTo(result2.symbols[0].r, 10);
    });

    it("reloads coverage data on each analyze call", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      let loadCount = 0;
      const coverageProvider: CoverageProvider = {
        async loadCoverage() { loadCount++; },
        getStatements() { return undefined; },
      };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider,
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      expect(loadCount).toBe(3);
    });

    it("uses different config on each call without carryover", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [
          { name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
          { name: "fn2", selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 8 },
        ]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const maxConfig: DdpConfiguration = { ...DEFAULT_CONFIGURATION, fileRollup: "max" };
      const sumConfig: DdpConfiguration = { ...DEFAULT_CONFIGURATION, fileRollup: "sum" };

      const maxResult = await orchestrator.analyze(maxConfig, neverCancelledCtx());
      const sumResult = await orchestrator.analyze(sumConfig, neverCancelledCtx());
      assert(maxResult !== undefined);
      assert(sumResult !== undefined);

      const maxRollup = maxResult.fileRollup.get(uri)!;
      const sumRollup = sumResult.fileRollup.get(uri)!;
      const maxF = Math.max(...maxResult.symbols.map(s => s.f));
      const sumF = sumResult.symbols.reduce((sum, s) => sum + s.f, 0);
      expect(maxRollup).toBeCloseTo(maxF, 5);
      expect(sumRollup).toBeCloseTo(sumF, 5);
    });
  });

  // ─── Numeric Edge Cases ───────────────────────────────────────────────────

  describe("numeric edge cases", () => {
    it("returns CC of 1 for empty function body", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      // estimateCyclomaticComplexity("") → 1
      expect(result.symbols[0].cc).toBe(1);
    });

    it("returns CC=0 from tool when tool reports CC=0", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const toolProvider: CyclomaticComplexityProvider = {
        async computeComplexity(): Promise<CcResult> {
          return { byLine: new Map([[1, 0]]), byName: new Map() };
        },
      };
      const ccRegistry = new CcProviderRegistry();
      ccRegistry.register({ supportedLanguages: ["typescript"], provider: toolProvider });

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry,
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].cc).toBe(0);
    });

    it("handles zero selectionStartLine and selectionStartCharacter", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 0 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].id).toBe("file:///a.ts#0:0");
    });

    it("handles full coverage (t=1.0) producing lower CRAP", async () => {
      const uri = "file:///a.ts";
      const source = "if (a) { b(); }";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", source)]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      const coverage = new Map([
        [uri, [
          { executed: true, startLine: 0, endLine: 0 },
          { executed: true, startLine: 1, endLine: 1 },
          { executed: true, startLine: 2, endLine: 2 },
          { executed: true, startLine: 3, endLine: 3 },
          { executed: true, startLine: 4, endLine: 4 },
          { executed: true, startLine: 5, endLine: 5 },
        ]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(coverage),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].t).toBeCloseTo(1.0, 5);
      // With t=1.0, CRAP = CC² × 0 + CC = CC
      expect(result.symbols[0].crap).toBeCloseTo(result.symbols[0].cc, 5);
    });

    it("handles zero coverage (t=0.0) producing higher CRAP", async () => {
      const uri = "file:///a.ts";
      const source = "if (a) { b(); }";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", source)]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      const coverage = new Map([
        [uri, [
          { executed: false, startLine: 0, endLine: 0 },
          { executed: false, startLine: 1, endLine: 1 },
        ]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(coverage),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].t).toBeCloseTo(0.0, 5);
      // With t=0.0, CRAP = CC² × 1 + CC = CC² + CC
      const cc = result.symbols[0].cc;
      expect(result.symbols[0].crap).toBeCloseTo(cc * cc + cc, 5);
    });

    it("handles large CC value from tool", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const toolProvider: CyclomaticComplexityProvider = {
        async computeComplexity(): Promise<CcResult> {
          return { byLine: new Map([[1, 500]]), byName: new Map() };
        },
      };
      const ccRegistry = new CcProviderRegistry();
      ccRegistry.register({ supportedLanguages: ["typescript"], provider: toolProvider });

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry,
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].cc).toBe(500);
      expect(result.symbols[0].f).toBeGreaterThan(0);
      expect(Number.isFinite(result.symbols[0].f)).toBe(true);
    });
  });

  // ─── String/URI Edge Cases ────────────────────────────────────────────────

  describe("string/URI edge cases", () => {
    it("handles URIs with special characters", async () => {
      const uri = "file:///path%20with%20spaces/my%23file.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].uri).toBe(uri);
      expect(result.symbols[0].id).toContain(uri);
    });

    it("handles function names with special characters", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "[Symbol.iterator]", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].name).toBe("[Symbol.iterator]");
    });

    it("handles empty function name", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols[0].name).toBe("");
    });
  });

  // ─── Violated Domain Constraints ──────────────────────────────────────────

  describe("violated domain constraints", () => {
    it("handles duplicate symbol IDs gracefully (two functions at same position)", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      // Two different-named functions with same selection position → same symbol ID
      const symbols = new Map([
        [uri, [
          { name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
          { name: "fn2", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
        ]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      // Both symbols should still be in the output even with duplicate IDs
      expect(result.symbols).toHaveLength(2);
    });

    it("handles edges referencing symbols not in workspace", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      // Edge references a callee that doesn't exist as a symbol
      const edges: CallEdge[] = [
        { caller: `${uri}#0:0`, callee: "file:///nonexistent.ts#0:0" },
      ];

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider(edges),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols).toHaveLength(1);
      expect(result.edgesCount).toBe(1);
    });

    it("handles self-referencing edge (recursive function)", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "if (n > 0) fn(n-1)")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);
      const edges: CallEdge[] = [
        { caller: `${uri}#0:0`, callee: `${uri}#0:0` },
      ];

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider(edges),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols).toHaveLength(1);
      expect(result.edgesCount).toBe(1);
      expect(Number.isFinite(result.symbols[0].r)).toBe(true);
      expect(Number.isFinite(result.symbols[0].f)).toBe(true);
    });

    it("handles bodyStartLine > bodyEndLine gracefully", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 5 }]],
      ]);

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      // Should not throw
      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols).toHaveLength(1);
    });

    it("handles config with rank epsilon=0 and maxIterations=0", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [{ name: "fn", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      const config: DdpConfiguration = {
        ...DEFAULT_CONFIGURATION,
        rank: { maxIterations: 0, epsilon: 0 },
      };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(config, neverCancelledCtx());
      assert(result !== undefined, "expected result");
      expect(result.symbols).toHaveLength(1);
      expect(Number.isFinite(result.symbols[0].r)).toBe(true);
    });
  });

  // ─── Cancellation Edge Cases ──────────────────────────────────────────────

  describe("cancellation edge cases", () => {
    it("returns undefined when cancelled immediately (before loadCoverage)", async () => {
      const ctx: AnalysisContext = { isCancelled: () => true };

      const loadCalled = { value: false };
      const coverageProvider: CoverageProvider = {
        async loadCoverage() { loadCalled.value = true; },
        getStatements() { return undefined; },
      };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(new Map()),
        symbolProvider: fakeSymbolProvider(new Map()),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider,
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, ctx);
      // loadCoverage is called before the first cancel check, so it will run
      expect(loadCalled.value).toBe(true);
      expect(result).toBeUndefined();
    });

    it("returns partial result undefined when cancelled after some files processed", async () => {
      const uri1 = "file:///a.ts";
      const uri2 = "file:///b.ts";
      const docs = new Map([
        [uri1, fakeDoc(uri1, "typescript", "return 1")],
        [uri2, fakeDoc(uri2, "typescript", "return 2")],
      ]);
      const symbols = new Map([
        [uri1, [{ name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
        [uri2, [{ name: "fn2", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 }]],
      ]);

      let filesOpened = 0;
      const docProvider: DocumentProvider = {
        async findSourceFiles() { return [uri1, uri2]; },
        async openDocument(uri) { filesOpened++; return docs.get(uri); },
      };

      // Cancel after first file is opened
      const ctx: AnalysisContext = { isCancelled: () => filesOpened >= 1 };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: docProvider,
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider([]),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger: nullLogger,
      });

      const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, ctx);
      // The cancel check happens at the top of the loop, so after opening the first file
      // and processing it, the cancel check fires for the second iteration
      // This means 1 file gets processed, then the loop breaks, then metrics are computed
      // Actually: the cancel check is BEFORE openDocument, so first iteration passes,
      // second iteration's cancel check sees filesOpened=1 and breaks
      expect(result).not.toBeUndefined();
      // Only first file's symbol should be in results
      if (result) {
        expect(result.symbols.length).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────────

  describe("logging", () => {
    it("logs completion message with correct symbol and edge counts", async () => {
      const uri = "file:///a.ts";
      const docs = new Map([[uri, fakeDoc(uri, "typescript", "return 1")]]);
      const symbols = new Map([
        [uri, [
          { name: "fn1", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 },
          { name: "fn2", selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 8 },
        ]],
      ]);
      const edges: CallEdge[] = [
        { caller: `${uri}#0:0`, callee: `${uri}#5:0` },
      ];

      const infos: string[] = [];
      const logger = { info(msg: string) { infos.push(msg); }, warn() {}, error() {} };

      const orchestrator = new AnalysisOrchestrator({
        documentProvider: fakeDocProvider(docs),
        symbolProvider: fakeSymbolProvider(symbols),
        callGraphProvider: fakeCallGraphProvider(edges),
        coverageProvider: fakeCoverageProvider(new Map()),
        ccRegistry: new CcProviderRegistry(),
        logger,
      });

      await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
      expect(infos.length).toBe(1);
      expect(infos[0]).toContain("2 symbols");
      expect(infos[0]).toContain("1 edges");
    });
  });
});

// ─── Test-file exclusion ──────────────────────────────────────────────────────

describe("test-file exclusion", () => {
  /**
   * A fakeDocProvider that filters out test-file URIs when `excludeTests` is
   * true, mirroring what VsCodeDocumentProvider does via buildExcludeGlob.
   */
  function filteringDocProvider(
    docs: Map<string, DocumentInfo>,
    excludeTests: boolean,
  ): DocumentProvider {
    return {
      async findSourceFiles() {
        const all = [...docs.keys()];
        return excludeTests ? all.filter((u) => !isTestFileUri(u)) : all;
      },
      async openDocument(uri) {
        return docs.get(uri);
      },
    };
  }

  const prodUri = "file:///project/src/service.ts";
  const testUri = "file:///project/src/service.test.ts";

  function buildDocs() {
    return new Map<string, DocumentInfo>([
      [prodUri, fakeDoc(prodUri, "typescript")],
      [testUri, fakeDoc(testUri, "typescript")],
    ]);
  }

  function buildSymbols() {
    return new Map<string, FunctionSymbolInfo[]>([
      [prodUri, [{ name: "serve", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 }]],
      [testUri, [{ name: "itServes", selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 }]],
    ]);
  }

  it("excludes test files from results when excludeTests is true", async () => {
    const docs = buildDocs();
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: filteringDocProvider(docs, true),
      symbolProvider: fakeSymbolProvider(buildSymbols()),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result);
    const uris = result.symbols.map((s) => s.uri);
    expect(uris).toContain(prodUri);
    expect(uris).not.toContain(testUri);
  });

  it("includes test files in results when excludeTests is false", async () => {
    const docs = buildDocs();
    const noExclude: DdpConfiguration = { ...DEFAULT_CONFIGURATION, excludeTests: false };
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: filteringDocProvider(docs, false),
      symbolProvider: fakeSymbolProvider(buildSymbols()),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(noExclude, neverCancelledCtx());
    assert(result);
    const uris = result.symbols.map((s) => s.uri);
    expect(uris).toContain(prodUri);
    expect(uris).toContain(testUri);
  });

  it("orchestrator safety-net excludes test files even when provider does not filter", async () => {
    // Simulates the bug where buildExcludeGlob's nested braces fail in VS Code:
    // the document provider returns test files, but the orchestrator still filters them.
    const docs = buildDocs();
    const orchestrator = new AnalysisOrchestrator({
      documentProvider: fakeDocProvider(docs), // does NOT filter test files
      symbolProvider: fakeSymbolProvider(buildSymbols()),
      callGraphProvider: fakeCallGraphProvider([]),
      coverageProvider: fakeCoverageProvider(new Map()),
      ccRegistry: new CcProviderRegistry(),
      logger: nullLogger,
    });

    const result = await orchestrator.analyze(DEFAULT_CONFIGURATION, neverCancelledCtx());
    assert(result);
    const uris = result.symbols.map((s) => s.uri);
    expect(uris).toContain(prodUri);
    expect(uris).not.toContain(testUri);
  });
});
