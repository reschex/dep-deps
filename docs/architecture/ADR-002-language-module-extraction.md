# ADR-002: Language Module Extraction

**Status:** Accepted (Implemented)  
**Date:** 2026-04-28  
**Decision Makers:** Architect  
**Supersedes:** None  
**Related:** ADR-001 (CLI Analysis Architecture)

## Context

The codebase has three axes of variation:

1. **Tool** — VS Code extension, CLI, future IntelliJ plugin
2. **Language** — TypeScript/JavaScript, Python, Java, future additions
3. **Capability** — symbol extraction, cyclomatic complexity, call graph, coverage

The current folder structure makes only the tool axis partially explicit (`src/ddp/` for VS Code, `src/cli/` for CLI). Language-specific logic is scattered:

- **CC providers** live in `src/ddp/cc/` (ESLint, Radon, PMD) — inside the VS Code adapter layer, despite being pure Node.js subprocess code with no VS Code dependency.
- **File discovery globs** (`*.{ts,tsx,js,jsx,mjs,cjs,py,java}`) are hardcoded in `src/ddp/configuration.ts` and `src/cli/adapters/nodeDocument.ts`.
- **Test file patterns** (`.test.`, `.spec.`, `__tests__`, Java `IT` suffix) are embedded in `configuration.ts`.
- **CC result format knowledge** (`byLine` for ESLint/PMD, `byName` for Radon) is handled in `analysisOrchestrator.ts`.
- **TS Compiler API symbol extraction** lives in `src/cli/adapters/nodeSymbol.ts` — inside the CLI layer, despite being language knowledge reusable by any non-LSP tool.

This creates three concrete problems:

1. **The CLI cannot reuse CC providers** without importing from the VS Code layer, violating the dependency rule.
2. **Adding a new language** (e.g., Go) requires touching files across `src/ddp/cc/`, `src/ddp/configuration.ts`, `src/core/ccRegistry.ts`, and `src/ddp/analysisOrchestrator.ts` — with no guide or single directory to orient a developer.
3. **Adding a new tool** (e.g., IntelliJ) would duplicate language knowledge already present in the codebase but trapped in tool-specific directories.

## Decision

Extract language-specific logic into a **`src/language/`** layer, positioned between `core/` (domain) and `adapter/` (tool-specific glue). Rename `src/ddp/` to `src/adapter/vscode/` and `src/cli/` to `src/adapter/cli/` to make the tool axis explicit.

### Target Structure

```
src/
├── core/                              # Domain — pure computation, no I/O
│   ├── ports.ts                       # All port interfaces
│   ├── analyze.ts                     # computeSymbolMetrics
│   ├── metrics.ts                     # CRAP, F calculation
│   ├── rank.ts                        # PageRank
│   ├── churn.ts                       # Churn multiplier
│   ├── coverageMap.ts                 # Coverage fraction per symbol
│   ├── lcovParse.ts                   # LCOV parser
│   ├── jacocoParse.ts                 # JaCoCo parser
│   ├── ccRegistry.ts                  # CC provider registry
│   ├── graphBuilder.ts                # Call edge conversion
│   └── rollup.ts                      # File-level rollup
│
├── language/                          # Language knowledge — shared across tools
│   ├── typescript/                    # TS/JS/TSX/JSX
│   │   ├── patterns.ts               # Supported language IDs, file globs, test patterns
│   │   ├── symbols.ts                # TS Compiler API symbol extraction (from nodeSymbol.ts)
│   │   └── cc/
│   │       ├── eslintCc.ts            # CyclomaticComplexityProvider impl
│   │       ├── eslintSpawn.ts         # Subprocess invocation
│   │       └── eslintParse.ts         # JSON output parsing
│   │
│   ├── python/
│   │   ├── patterns.ts
│   │   └── cc/
│   │       ├── radonCc.ts
│   │       ├── radonSpawn.ts
│   │       └── radonParse.ts
│   │
│   ├── java/
│   │   ├── patterns.ts
│   │   └── cc/
│   │       ├── pmdCc.ts
│   │       ├── pmdSpawn.ts
│   │       └── pmdParse.ts
│   │
│   ├── estimateCc.ts                  # Universal regex fallback (from core/)
│   └── patterns.ts                    # Aggregated globs/patterns across all languages
│
├── adapter/                           # Tool-specific adapters
│   ├── vscode/                        # VS Code extension (from src/ddp/)
│   │   ├── adapters.ts                # LSP-based port implementations
│   │   ├── analysisService.ts         # Wires language/* + LSP → AnalysisOrchestrator
│   │   ├── analysisOrchestrator.ts    # VS Code orchestration
│   │   ├── configuration.ts           # VS Code settings reader
│   │   ├── register.ts                # Extension entry point
│   │   ├── lspCallGraph.ts            # LSP call hierarchy adapter
│   │   ├── lspCallGraphAdapter.ts     # Testable abstraction
│   │   └── ui/                        # Presentation concerns
│   │       ├── codeLensProvider.ts
│   │       ├── decorationManager.ts
│   │       ├── hoverProvider.ts
│   │       ├── riskTreeProvider.ts
│   │       └── revealSymbol.ts
│   │
│   └── cli/                           # CLI tool (from src/cli/)
│       ├── analyze.ts                 # CLI entry point
│       ├── adapters.ts                # File-system-based port implementations
│       └── formatters/
│           ├── json.ts
│           └── githubSummary.ts
│
└── extension.ts                       # VS Code activation (thin wrapper)
```

### Dependency Rule

```
core/         →  depends on nothing
language/     →  depends on core/ports.ts (implements port interfaces)
adapter/      →  depends on core/ + language/ (composes and wires)
extension.ts  →  depends on adapter/vscode/
```

No layer may import from a layer to its right. `language/` never imports from `adapter/`. `core/` never imports from `language/` or `adapter/`.

### Layer Responsibilities

| Layer | Contains | Does NOT contain |
|-------|----------|-----------------|
| `core/` | Port interfaces, metrics computation, ranking, parsers for coverage formats, registry | Language-specific logic, I/O, tool APIs |
| `language/` | CC provider implementations, file glob patterns, test detection heuristics, compiler-based symbol extractors | VS Code APIs, CLI arg parsing, UI code |
| `adapter/` | LSP wiring, VS Code configuration, CLI entry point, output formatters, UI components | Metrics computation, CC algorithm logic |

### What `language/*/patterns.ts` Exports

Each language module exports a standard shape (not a formal interface — just a convention):

```typescript
// language/typescript/patterns.ts
export const languageIds = ["typescript", "javascript", "typescriptreact", "javascriptreact"] as const;
export const fileGlob = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
export const testPatterns = [/\.test\./, /\.spec\./, /__tests__/];
```

```typescript
// language/patterns.ts — aggregate
import * as ts from "./typescript/patterns";
import * as py from "./python/patterns";
import * as java from "./java/patterns";

export const allLanguageIds = [...ts.languageIds, ...py.languageIds, ...java.languageIds];
export const sourceFileGlob = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}";
```

This replaces the hardcoded `SOURCE_FILE_GLOB` in `configuration.ts` and the duplicate glob in `nodeDocument.ts`.

## Technical Decisions

### 1. CC Providers Are Language Adapters, Not Tool Adapters

ESLint, Radon, and PMD providers implement the `CyclomaticComplexityProvider` port. They spawn subprocesses and parse output — pure Node.js with no tool dependency. They belong in `language/`, not `adapter/vscode/`.

Both VS Code and CLI can import `language/typescript/cc/eslintCc.ts` without violating the dependency rule.

### 2. `estimateCc.ts` Moves to `language/`

The regex-based CC estimator is a fallback CC implementation, not domain logic. It contains language-aware heuristics (keyword matching for `if`, `while`, `for`, etc.). Moving it to `language/estimateCc.ts` keeps `core/` free of language knowledge.

`core/ccRegistry.ts` stays — the registry is a domain pattern (strategy dispatch), not language knowledge.

### 3. `nodeSymbol.ts` Moves to `language/typescript/symbols.ts`

The TS Compiler API symbol extractor is language knowledge, not CLI infrastructure. A future IntelliJ adapter could reuse it (IntelliJ plugins can invoke Node.js). The CLI adapter would import it.

### 4. VS Code UI Files Move to `adapter/vscode/ui/`

CodeLens, decorations, hover, tree view, and reveal-symbol are pure presentation. Grouping them under `ui/` keeps the adapter directory scannable and separates wiring (adapters.ts, analysisService.ts) from presentation.

### 5. No Abstract `LanguagePlugin` Interface

The existing `CyclomaticComplexityProvider` port and `CcProviderRegistry` already handle CC dispatch. Symbol extraction and call graphs are tool-dependent (LSP in VS Code, Compiler API in CLI) and don't benefit from a unified per-language interface. Premature abstraction would add complexity without reducing the cost of adding a new language.

If a pattern emerges after 5+ languages, a plugin interface can be introduced then.

### 6. Test Files Move with Their Production Files

Every `.test.ts` file stays adjacent to the file it tests (e.g., `language/typescript/cc/eslintParse.test.ts` next to `eslintParse.ts`). No separate `__tests__` directory.

## Migration Plan

Each step is a single commit. Tests pass after every step. No behavior changes.

| Step | Action | Risk |
|------|--------|------|
| 1 | Create `src/language/` directories | None — additive |
| 2 | Move `src/ddp/cc/*` → `src/language/{typescript,python,java}/cc/*` | Low — update imports |
| 3 | Move `src/core/estimateCc.ts` → `src/language/estimateCc.ts` | Low — update imports |
| 4 | Extract glob/test patterns from `configuration.ts` → `language/*/patterns.ts` | Low — replace constants |
| 5 | Move `src/cli/adapters/nodeSymbol.ts` → `src/language/typescript/symbols.ts` | Low — update imports |
| 6 | Rename `src/ddp/` → `src/adapter/vscode/` | Medium — many import paths change |
| 7 | Rename `src/cli/` → `src/adapter/cli/` | Medium — import paths + package.json bin |
| 8 | Group VS Code UI files into `adapter/vscode/ui/` | Low — move presentation files |
| 9 | Update `tsconfig.json`, `extension.ts` entry point, `package.json` | Low — configuration |

Steps 6–7 have the widest blast radius (most import updates) but are mechanical. IDE rename tooling handles this safely.

## Consequences

### Positive

- **Adding a language is self-contained**: create `src/language/<lang>/` with CC provider + patterns. Register in `ccRegistry`. Done.
- **CC providers are reusable**: CLI gains ESLint/Radon/PMD support for free.
- **Tool boundaries are explicit**: `adapter/vscode/` vs `adapter/cli/` vs future `adapter/intellij/`.
- **Dependency rule is visible in the folder tree**: core → language → adapter reads left to right as inner to outer.
- **Reduced duplication**: file globs and test patterns defined once per language, used everywhere.

### Negative

- **Large refactoring commit** (steps 6–7): renaming `src/ddp/` touches many files. Mitigated by doing it in one mechanical commit with IDE refactoring tools.
- **Deeper directory nesting**: `src/language/typescript/cc/eslintParse.ts` is four levels deep. Acceptable given the clarity gained.
- **Migration period**: in-flight branches will need rebase. Coordinate timing.

### Neutral

- **Test count unchanged**: no tests added or removed — pure refactoring.
- **Build output unchanged**: compiled JS structure mirrors new source structure.
- **Extension activation path changes**: `extension.ts` → `adapter/vscode/register.ts` instead of `ddp/register.ts`.

## Alternatives Considered

### Alternative 1: Keep CC Providers in `src/ddp/cc/`, Share via Re-exports

Create `src/shared/cc/` that re-exports from `src/ddp/cc/`.

**Rejected because:** this patches a symptom (CLI can't import from ddp) without fixing the structural problem (language knowledge trapped in tool layer). Re-exports create indirection without clarity.

### Alternative 2: Move Everything to `src/core/`

Put CC providers, symbol extractors, and patterns in `core/`.

**Rejected because:** `core/` should be pure domain logic with no I/O. CC providers spawn subprocesses. Symbol extractors read the file system. These are adapters — they belong outside the domain core.

### Alternative 3: Flat `src/cc/`, `src/symbols/`, `src/patterns/` Directories

Organize by capability instead of by language.

**Rejected because:** adding a new language would require touching files across all capability directories. Organizing by language makes the "add Go support" workflow self-contained: create one directory, not scatter files across many.

### Alternative 4: Plugin Architecture with Dynamic Registration

Define a `LanguagePlugin` interface with `getSymbols()`, `getCc()`, `getCallGraph()`, and use dynamic discovery.

**Rejected because:** premature. The current `CcProviderRegistry` already handles CC dispatch. Symbol extraction and call graphs are tool-dependent, not language-dependent (LSP vs Compiler API). A unified plugin interface would force awkward abstractions for capabilities that don't vary the same way. Revisit if 5+ languages reveal a pattern.
