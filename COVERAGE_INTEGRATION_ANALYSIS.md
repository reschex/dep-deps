# Coverage Data Integration Analysis

## 1. Current Coverage Data Handling Mechanism

### Entry Point: CoverageStore
[CoverageStore](src/ddp/coverageStore.ts) is the central holder of coverage data:
- Stores **statement-level coverage keyed by file URI** (vscode.Uri.toString())
- Data structure: `Map<string, StatementCover[]>` where `StatementCover` = `{ executed: boolean; startLine: number; endLine: number }`
- Statements are **0-based line numbers**

### Coverage Loading Pipeline

1. **LCOV File Reading** ([lcov.ts](src/ddp/lcov.ts)):
   - `loadLcovIntoStore()` finds LCOV files matching glob pattern (default: `**/coverage/lcov.info`)
   - Scans all workspace folders respecting cancellation tokens
   - Handles both relative and absolute file paths with `normalizeLcovPathToUri()`

2. **LCOV Parsing** ([lcovParse.ts](src/core/lcovParse.ts)):
   - `parseLcovToStatementCovers()` parses LCOV text format (SF + DA records)
   - Converts 1-based LCOV line numbers to 0-based internal format
   - Output: `Map<string, StatementCover[]>` with source file → statements mapping
   - `mergeLcovMaps()` combines multiple LCOV files by concatenating statement arrays

3. **VS Code Adapter** ([adapters.ts](src/ddp/adapters.ts) - `VsCodeCoverageProvider`):
   - Implements port interface `CoverageProvider`
   - Delegates loading to `loadLcovIntoStore()`
   - Provides `getStatements(uri)` to retrieve statements for a file

### Type Definitions

**StatementCover** (from [coverageMap.ts](src/core/coverageMap.ts)):
```typescript
type StatementCover = {
  readonly executed: boolean;      // hit > 0 in LCOV
  readonly startLine: number;      // 0-based
  readonly endLine: number;        // 0-based
};
```

**LineRange** (used for symbol bodies):
```typescript
type LineRange = {
  readonly startLine: number;      // 0-based
  readonly endLine: number;        // 0-based
};
```

---

## 2. Where Calculations Occur

### Core Calculation Phases

#### Phase 1: Coverage Fraction Calculation
**Location**: [coverageMap.ts](src/core/coverageMap.ts) - `coverageFractionForSymbol()`

Function calculates test coverage fraction **T** for a specific symbol (function/method):
```
T = executedStatements / totalStatements (in symbol's line range)
```

Logic:
- Filters statements that **overlap** with symbol's body line range (0-based inclusive)
- Counts total overlapping statements
- Counts executed (hit) statements among overlapping
- Returns T ∈ [0, 1] or fallback T when no statements overlap
- **Fallback T** is configurable (default: 0) in [configuration.ts](src/ddp/configuration.ts)

#### Phase 2: Per-Symbol Metrics Computation
**Location**: [analyze.ts](src/core/analyze.ts) - `computeSymbolMetrics()`

Input per symbol: `SymbolInput = { id, uri, name, cc (cyclomatic complexity), t (coverage) }`

Calculations:
1. **Rank (R)**: Computed via PageRank-like algorithm (see Phase 3)
2. **CRAP Score**: `CRAP = CC² × (1 − T)³ + CC` (from Gorman "Dependable Dependencies")
3. **Failure Risk**: `F = R × CRAP`

**Location**: [metrics.ts](src/core/metrics.ts):
```typescript
crap(cc, t) = cc² × (1 - t)³ + cc
failureRisk(rank, cc, t) = rank × crap(cc, t)
```

#### Phase 3: Rank Propagation
**Location**: [rank.ts](src/core/rank.ts) - `computeRanks()`

Implements call-graph-based ranking:
- Each symbol starts at R = 1
- Iteratively updates: `R_new(v) = 1 + Σ (R_caller / outDegree(caller))`
- Converges when max delta < epsilon (default: 1e-6)
- Max iterations: 100 (configurable)

#### Phase 4: File-Level Rollup
**Location**: [rollup.ts](src/core/rollup.ts) - `rollupFileRisk()`

Aggregates per-symbol failure risk to file level:
- **"max" mode** (default): `file_risk = max(symbol_risks in file)`
- **"sum" mode**: `file_risk = Σ(symbol_risks in file)`

---

## 3. Data Flow from Coverage Reading to Calculations

```
┌─────────────────────────────────────────────────────────────────┐
│                        AnalysisService                          │
│  (VS Code facade, entry point for analysis)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              AnalysisOrchestrator.analyze()                      │
│  (Infrastructure-agnostic core orchestration)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴───────────────────────────┐
                    │                                    │
                    ▼                                    ▼
         ┌──────────────────────┐         ┌──────────────────────┐
         │  coverageProvider    │         │  symbolProvider,     │
         │  .loadCoverage()     │         │  callGraphProvider,  │
         │        ↓             │         │  documentProvider    │
         │  LCOV files loaded   │         │        ↓             │
         │  into CoverageStore  │         │  Symbols, edges,     │
         │                      │         │  documents extracted │
         └──────────────────────┘         └──────────────────────┘
                    │                                    │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  For each symbol:      │
                    │  ─────────────────────  │
                    │  1. Get file's         │
                    │     statements         │
                    │  2. Calculate T using: │
                    │     coverageFraction   │
                    │     ForSymbol()        │
                    │                        │
                    │  Create SymbolInput    │
                    │  { id, uri, name,     │
                    │    cc, t }            │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  computeSymbolMetrics()│
                    │  ─────────────────────  │
                    │  1. Rank from edges    │
                    │  2. CRAP = f(cc, t)    │
                    │  3. F = R × CRAP       │
                    │                        │
                    │  Output: SymbolMetrics │
                    │  { ...SymbolInput,     │
                    │    r, crap, f }       │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  rollupFileRisk()      │
                    │  ─────────────────────  │
                    │  Aggregate symbols     │
                    │  to file-level risk    │
                    │                        │
                    │  Output:               │
                    │  Map<uri, fileRisk>    │
                    └────────────────────────┘
```

### Key Data Structure Flow

```
LCOV File
    ↓
parseLcovToStatementCovers()
    ↓
StatementCover[]         SymbolInfo        CallEdges
    ↓                        ↓                ↓
CoverageStore  ────→  coverageFractionForSymbol()  ────→  computeRanks()
    ↓                        ↓                              ↓
get(uri)             SymbolInput { t }         RankInput { id, r }
    ↓                        ↓                              ↓
StatementCover[]     computeSymbolMetrics()  ←─────────────┘
                             ↓
                      SymbolMetrics { r, crap, f }
                             ↓
                      rollupFileRisk()
                             ↓
                      Map<uri, fileRisk>
```

---

## 4. Interface and Type Definitions

### Port Interface: CoverageProvider
**Location**: [ports.ts](src/core/ports.ts)

```typescript
export interface CoverageProvider {
  loadCoverage(): Promise<void>;
  getStatements(uri: string): StatementCover[] | undefined;
}
```

### Coverage Data Types

**StatementCover** (fundamental coverage unit):
```typescript
export type StatementCover = {
  readonly executed: boolean;
  readonly startLine: number;    // 0-based
  readonly endLine: number;      // 0-based
};
```

**LineRange** (symbol body descriptor):
```typescript
export type LineRange = {
  readonly startLine: number;    // 0-based
  readonly endLine: number;      // 0-based
};
```

**CoverageConfig** (configurable coverage settings):
```typescript
export type CoverageConfig = {
  readonly fallbackT: number;    // T when no statements overlap symbol (default: 0)
  readonly lcovGlob: string;     // LCOV file pattern (default: "**/coverage/lcov.info")
};
```

### Symbol Metrics Types

**SymbolInput** (input to calculation):
```typescript
export type SymbolInput = {
  readonly id: string;           // Unique symbol identifier
  readonly uri: string;          // File URI
  readonly name: string;         // Function/method name
  readonly cc: number;           // Cyclomatic complexity
  readonly t: number;            // Coverage fraction [0, 1]
};
```

**SymbolMetrics** (complete calculated metrics):
```typescript
export type SymbolMetrics = SymbolInput & {
  readonly r: number;            // Rank (R) from call graph
  readonly crap: number;         // CRAP = CC² × (1 − T)³ + CC
  readonly f: number;            // Failure Risk = R × CRAP
};
```

---

## 5. Configuration Points

**File**: [configuration.ts](src/ddp/configuration.ts)

Coverage-related config:
- `coverage.fallbackT`: Default coverage when no statements overlap (default: 0)
- `coverage.lcovGlob`: File pattern to find LCOV reports (default: `**/coverage/lcov.info`)

Calculation-related config:
- `rank.maxIterations`: Max PageRank iterations (default: 100)
- `rank.epsilon`: Convergence threshold (default: 1e-6)
- `fileRollup`: File aggregation mode "max" or "sum" (default: "max")

---

## 6. Modifications Needed to Integrate Coverage into Calculations

### Current Integration Points

Coverage is **already integrated** into calculations at this point:

1. **Coverage Loading** → executed in [analysisOrchestrator.ts](src/ddp/analysisOrchestrator.ts):
   ```
   await coverageProvider.loadCoverage();
   ```

2. **Coverage Retrieval** → for each file's symbols:
   ```
   const statements = coverageProvider.getStatements(uri) ?? [];
   ```

3. **Coverage Fraction** → calculated per-symbol:
   ```
   const t = coverageFractionForSymbol(body, statements, config.coverage.fallbackT);
   ```

4. **Into Metrics** → used in failure risk calculation:
   ```
   SymbolMetrics.f = R × CRAP(CC, T)
   ```

### Potential Extension Points

If you need to **enhance or modify** coverage integration:

#### A. Coverage Calculation Logic
- Modify `coverageFractionForSymbol()` in [coverageMap.ts](src/core/coverageMap.ts) if you want different overlap semantics or weighting

#### B. Fallback Coverage Values
- Configure `coverage.fallbackT` in VS Code settings (currently defaults to 0)
- Current logic: when no statements overlap symbol, use fallback
- Alternative: could require coverage for all symbols, error on missing, or use heuristics

#### C. CRAP Formula Modifications
- Modify `crap()` function in [metrics.ts](src/core/metrics.ts) if formula needs adjustment
- Currently: `CRAP = CC² × (1 − T)³ + CC`
- Could adjust exponents, coefficients, or use alternative formulas

#### D. Coverage Data Sources
- Currently only LCOV parsing via `parseLcovToStatementCovers()` in [lcovParse.ts](src/core/lcovParse.ts)
- Could extend `CoverageStore.ingestStatementCovers()` to accept coverage from other sources:
  - VS Code's built-in coverage providers
  - Alternative coverage formats (JSON, custom)
  - Real-time coverage from test runners

#### E. Per-Symbol Coverage Aggregation
- Currently: one coverage fraction (T) per symbol
- Could extend `SymbolMetrics` to track:
  - Minimum/maximum/average coverage of branches in symbol
  - Line coverage vs. branch coverage distinction
  - Uncovered lines list for IDE display

#### F. File-Level Coverage Summary
- Currently: file rollup aggregates only failure risk (F)
- Could extend to also aggregate coverage metrics themselves:
  - File-level T value
  - Uncovered file hotspots

---

## Summary

**Coverage Data Handling**:
- LCOV files → parsed to `StatementCover[]` → stored in `CoverageStore` → retrieved by URI

**Calculation Points**:
1. Per-symbol coverage: `coverageFractionForSymbol()` (overlap-based)
2. Per-symbol CRAP: `crap(cc, t)` formula
3. Per-symbol Risk: `failureRisk(rank, cc, t)` = R × CRAP
4. Per-file Risk: `rollupFileRisk()` aggregation

**Data Flow**:
LCOV → CoverageStore → Statement retrieval → Coverage fraction → SymbolInput.t → CRAP calc → Failure risk → File rollup

**Key Interfaces**:
- `CoverageProvider` port (loadCoverage, getStatements)
- `StatementCover` type (executed, startLine, endLine - 0-based)
- `SymbolMetrics` type (final output with r, crap, f)
