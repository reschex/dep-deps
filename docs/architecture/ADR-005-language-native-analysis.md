# ADR-005: Language-Native Symbol and Call Graph Extraction

**Status:** Accepted  
**Date:** 2026-05-01  
**Decision Makers:** Architect  
**Supersedes:** ADR-002 Technical Decision 5 ("Symbol extraction and call graphs are tool-dependent")  
**Related:** ADR-001 (CLI Analysis Architecture), ADR-002 (Language Module Extraction)

---

## Context

ADR-002 established the `src/language/` layer and correctly moved cyclomatic complexity providers there — ESLint, Radon, and PMD all live in `src/language/<lang>/cc/` with no IDE dependency, and are consumed identically by both VS Code and CLI adapters.

However, ADR-002 Technical Decision 5 drew a line at symbol extraction and call graph construction:

> *"Symbol extraction and call graphs are tool-dependent (LSP in VS Code, Compiler API in CLI) and don't benefit from a unified per-language interface."*

Post-implementation audit has shown this assumption to be wrong, producing three categories of concrete defect.

### Defect Category 1: Non-Deterministic Results

Symbol extraction in VS Code is delegated entirely to `vscode.executeDocumentSymbolProvider`, which invokes whatever language server extension is installed:

| Context | TypeScript/JS | Python | Java |
|---------|--------------|--------|------|
| CLI | TS Compiler API (deterministic) ✅ | ❌ Not implemented | ❌ Not implemented |
| VS Code | LSP → built-in TS language server ✅ | LSP → **Pylance/Jedi, if installed** | LSP → **Language Support for Java, if installed** |

For Python and Java in VS Code, a user without the relevant extension installed gets zero symbols — every function shows F=0. The tool appears to work but silently produces meaningless output. There is no warning, no graceful degradation, no documentation of this requirement.

Even where results are produced (TypeScript), the TS Compiler API (CLI) and the VS Code LSP path can disagree on which symbols are extracted — different handling of arrow function assignments, anonymous class methods, and accessors means the same file can produce different F scores depending on the tool used.

### Defect Category 2: Missing Call Graph in CLI

The call graph — the core mechanism that provides dependency amplification (R > 1) — is entirely absent from CLI runs:

| Context | TypeScript/JS | Python | Java |
|---------|--------------|--------|------|
| CLI | `nullCallGraphProvider` (R=1 always) | R=1 always | R=1 always |
| VS Code | LSP call hierarchy | LSP → Python extension, if installed | LSP → Java extension, if installed |

CI/CD pipeline analysis reports F = CRAP, not F = R × CRAP. This degrades the primary value proposition of the tool for the most common automated use case.

### Defect Category 3: Future IDE Ports Are Blocked

A future IntelliJ or PyCharm adapter has no access to `vscode.*` APIs. Without language-native implementations in `src/language/`, an IntelliJ adapter would need to re-implement all symbol extraction and call graph logic from scratch — then repeat that for PyCharm. The ports-and-adapters architecture promises portability; this defect breaks it.

### Root Cause

Cyclomatic complexity, symbol extraction, and call graph construction are all **language-dependent capabilities**. They require understanding a specific language's syntax and semantics. None of them require an IDE. The CC providers were correctly placed in `src/language/` for precisely this reason. Symbol extraction and call graph construction belong there for exactly the same reason.

The mistake was classifying them as tool-dependent when they are language-dependent.

---

## Decision

**The following rule applies to all analysis capabilities, effective immediately:**

> Every analysis capability (symbols, call graph, CC) must have a language-native implementation in `src/language/<lang>/`. IDE-specific implementations (LSP, IntelliJ PSI) are optional enhancements for improved accuracy. No analysis capability may be gated on an IDE extension being installed.

### Revised Layer Responsibilities

| Layer | Contains | Does NOT contain |
|-------|----------|-----------------|
| `src/core/` | Port interfaces, metrics, ranking, parsers | Language logic, I/O, tool APIs |
| `src/language/` | CC providers, **symbol extractors**, **call graph builders**, file patterns | VS Code APIs, CLI arg parsing, UI |
| `src/adapter/` | IDE wiring, configuration, CLI entry point, UI, optional LSP/PSI enhancements | Metrics computation, language logic |

### Target Structure

```
src/language/
  typescript/
    symbols.ts          ← TS Compiler API (exists — correct)
    callGraph.ts        ← TS Compiler API (new)
    cc/                 ← ESLint (exists)
  python/
    symbols.ts          ← Python ast subprocess (new)
    cc/                 ← Radon (exists)
  java/
    symbols.ts          ← PMD XML extraction (new — extends existing PMD infrastructure)
    cc/                 ← PMD (exists)
```

### VS Code Adapter: Symbol Extraction

`VsCodeSymbolProvider` is replaced by a `NativeSymbolProvider` that dispatches to language-native implementations by `languageId`. The call to `vscode.executeDocumentSymbolProvider` is removed for symbol extraction — it is redundant for TypeScript (the Compiler API is more precise) and unreliable for Python/Java (extension-dependent).

### VS Code Adapter: Call Graph

`VsCodeCallGraphProvider` becomes a hybrid: the language-native call graph is the baseline (always works), and the LSP call hierarchy is an optional enhancement (used when extensions are present). For TypeScript and JavaScript, the built-in VS Code TypeScript language server always provides call hierarchy, so LSP remains the preferred path; the native implementation provides the fallback. For Python and Java, the native implementation is the only path until language-native call graphs are built.

### CLI Adapter: Call Graph

`nullCallGraphProvider` in `cliAnalysis.ts` is replaced by `NodeCallGraphProvider`, which wraps `src/language/typescript/callGraph.ts`. Python and Java call graphs remain null (R=1) until language-native implementations are complete (Phase 3 below).

### Future IDE Adapters (IntelliJ, PyCharm)

A future `src/adapter/intellij/` imports language-native providers from `src/language/` directly. IntelliJ PSI can optionally augment call graph accuracy. Approximately 80% of analysis logic is shared at zero duplication cost.

---

## Implementation Phases

### Phase 1: Language-Native Symbol Extraction

**1a. Python symbol extraction** — `src/language/python/symbols.ts`

Spawn Python with an inline script that uses the `ast` module (standard library, Python 3.8+). Follow the `radonSpawn.ts` pattern: `spawnAndCollect` → parse JSON output. This is the same tool dependency already required by Radon for CC. The script visits `FunctionDef`, `AsyncFunctionDef`, and class-nested methods, emitting `FunctionSymbolInfo[]` as JSON to stdout.

**1b. Java symbol extraction** — `src/language/java/symbols.ts`

Extend the existing PMD XML infrastructure. The PMD violation element already carries `method`, `class`, `beginline`, and `endline` attributes for CyclomaticComplexity violations. A new parse function extracts `FunctionSymbolInfo[]` from these attributes, reusing the existing `pmdSpawn.ts` invocation with no new tool dependencies.

**1c. Replace `VsCodeSymbolProvider`** — `src/adapter/vscode/adapters.ts`

Replace the single `vscode.executeDocumentSymbolProvider` call with a `NativeSymbolProvider` that routes by `languageId`:

- `typescript` / `javascript` / `typescriptreact` / `javascriptreact` → `NodeSymbolProvider`
- `python` → `PythonSymbolProvider`
- `java` → `JavaSymbolProvider`
- unknown → returns `[]`

The `VsCodeSymbolProvider` class is deleted.

### Phase 2: TypeScript Call Graph via Compiler API

**2a. Native TS call graph** — `src/language/typescript/callGraph.ts`

Build a `CallGraphProvider` implementation using the TypeScript Compiler API:

1. `ts.createProgram()` across all workspace source files (bounded by `maxFiles`)
2. For each source file, walk the AST visiting `CallExpression` nodes
3. For each call site, resolve the callee via `checker.getSymbolAtLocation()` and `checker.getAliasedSymbol()`
4. Map caller and callee positions to `CallEdge` format using symbol IDs consistent with `uri#line:character`

**2b. Replace `nullCallGraphProvider`** — `src/adapter/cli/cliAnalysis.ts`

Wire `NodeCallGraphProvider` (wraps `src/language/typescript/callGraph.ts`) in place of the null stub. CLI analysis now reports R > 1 for TypeScript symbols with callers.

**2c. Hybrid VS Code call graph** — `src/adapter/vscode/adapters.ts`

Compose `NativeCallGraphProvider` and `VsCodeCallGraphProvider` (existing LSP implementation) into a `HybridCallGraphProvider`:

- For TS/JS: prefer LSP (the built-in TypeScript language server always provides call hierarchy, with better cross-file type resolution than the Compiler API alone)
- For Python/Java: use native (LSP is extension-dependent; fall back to null until Phase 3)
- If LSP throws or returns empty: fall back to native

### Phase 3: Python and Java Call Graph (Deferred)

Language-native call graph analysis for Python and Java is non-trivial and deferred until Phase 1 and Phase 2 are stable. In the interim, R=1 for Python and Java in all contexts (current behaviour). Document this limitation explicitly in the README.

---

## Consequences

### Positive

- **Deterministic**: Identical results regardless of VS Code extensions installed
- **CLI completeness**: TypeScript CLI analysis includes dependency amplification (R > 1 for TypeScript)
- **Multi-language CLI**: Python and Java symbols available in headless CI/CD runs
- **IntelliJ/PyCharm ready**: Future IDE ports reuse `src/language/` at ~80% code share
- **No undocumented requirements**: Python/Java analysis works without Pylance or Java extension installed
- **Trustworthy metric**: F scores are reproducible; the same file always produces the same result

### Negative

- **Python subprocess per file**: Symbol extraction spawns a Python process, adding latency. Mitigation: batch symbol extraction with the existing Radon CC subprocess (both require Python in PATH).
- **Compiler API memory**: Full TypeScript program compilation in CLI requires loading all source files. Mitigation: the existing `maxFiles` configuration cap limits scope; incremental compilation (`ts.createIncrementalProgram`) can be explored if latency is observed.
- **LSP call graph quality for Python/Java in VS Code**: Users with Pylance who currently receive LSP-based Python call graphs will have those replaced by null (R=1) until Phase 3. This is disclosed as a known limitation.

### Neutral

- Test count increases proportionally — each new language implementation requires characterisation tests
- PMD and Radon version requirements are unchanged
- Existing `NodeSymbolProvider` at `src/language/typescript/symbols.ts` requires no changes

---

## Alternatives Considered

### Alternative 1: Keep LSP Primary in VS Code, Build CLI Separately

Maintain `VsCodeSymbolProvider` (LSP) for VS Code and build independent CLI implementations for Python/Java.

**Rejected:** Produces different results between VS Code and CLI for the same file. Duplicates implementation effort. Does not resolve the extension dependency for Python/Java in VS Code.

### Alternative 2: Tree-sitter as Universal Parser

Use `tree-sitter` with grammars for TypeScript, Python, and Java across all tools.

**Deferred as long-term direction:** Tree-sitter provides genuine uniformity and is worth revisiting when 5+ languages are needed. Deferred now because:
- NAPI native bindings introduce packaging complexity for VS Code VSIX distribution
- Python and Java grammars need validation for DDP's specific extraction needs
- The immediate problem is solvable without tree-sitter
- Revisit if the subprocess-per-file latency becomes a problem at scale

### Alternative 3: Declare Extensions as Required Dependencies

Declare Pylance and Language Support for Java in `extensionDependencies` in `package.json`.

**Rejected:** Forces heavyweight language extensions on users of a lightweight metric tool. Breaks CLI usage entirely. Contradicts the tool's value proposition of working without IDE configuration.

### Alternative 4: Suppress Analysis for Unlicensed Languages

Show a warning when Python/Java files are discovered but no extension is installed; omit those files from results.

**Rejected:** Silent omission of a language's files while analysing others produces misleading workspace-level risk scores. A diagnostic warning alone does not fix the CI/CD gap.

---

## Revision to ADR-002

ADR-002 Technical Decision 5 is superseded by this ADR. The rest of ADR-002 (layer structure, dependency rule, CC provider placement, file patterns) remains valid and is not affected.

The corrected principle for the `src/language/` layer is:

> Language-specific implementations of **all** analysis capabilities — CC, symbol extraction, and call graph construction — belong in `src/language/<lang>/`. The presence of an IDE plugin or language server must never be a prerequisite for producing analysis output.
