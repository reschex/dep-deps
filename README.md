# dep-deps
Dependable Dependencies Principle as VSCode Extension

From [Dependable Dependencies (Gorman, 2011)](https://codemanship.co.uk/Dependable%20Dependencies.pdf)

## Usage

### Overview

The **Dependable Dependencies** extension analyzes your codebase to identify high-risk functions and methods based on cyclomatic complexity, test coverage, and their importance in the codebase's call graph. It computes a **failure risk (F)** score for each function to guide testing and refactoring efforts.

![alt example_risk_view](resources/example_ddp_risk_view.png)

### Commands

Use **Shift+Ctrl+P** (or **Cmd+Shift+P** on macOS) to run these commands:

- **`DDP: Analyse Workspace`** — Analyzes all source files in the current workspace
- **`DDP: Analyse Folder...`** — Opens a dialog to select a specific folder/project to analyze
- **`DDP: Refresh`** — Re-runs analysis on the last analyzed scope

### Viewing Results

Results appear in the **DDP Risks** sidebar panel (left side in the **Explorer** view). The tree displays:

- **Files** — grouped by analyzed folder
- **Functions/Methods** — under each file, sorted by failure risk (highest first)
- **Metrics** — inline display of `CC`, `T`, `CRAP`, `R`, and `F` for each symbol

Click any function to jump to its definition in the editor. Hover over function names for detailed metric tooltips.

### Understanding the Metrics

Each function is rated using these metrics from [Dependable Dependencies (Gorman, 2011)](https://codemanship.co.uk/Dependable%20Dependencies.pdf):

| Metric | Meaning | Range | Notes |
|--------|---------|-------|-------|
| **CC** | Cyclomatic Complexity (McCabe) | 1–∞ | Counts decision branches (if, loops, etc.); higher = more complex |
| **T** | Test Coverage (fraction) | 0.0–1.0 | Percentage of function covered by tests (from LCOV data); 0 if no coverage data found |
| **CRAP** | Change Risk Anti-Pattern | 0–∞ | Formula: `CC² × (1 − T)³ + CC`; higher = riskier to change |
| **R** | Rank (call graph importance) | 1.0–∞ | PageRank-like score from the call graph; how many other functions depend on this one (directly or indirectly) |
| **F** | Failure Risk | 0–∞ | Formula: `R × CRAP`; **the primary risk score**; focus testing/refactoring on high F values |

**Quick interpretation:**
- **High CC, low T** → High CRAP (complex code with little test coverage)
- **High T** → CRAP reduced significantly (tests make risky code safer)
- **High R + high CRAP** → High F (failures here cascade through dependents)

### Editor Decorations

Functions are highlighted in the editor based on their `F` (failure risk) score:

- **Yellow squiggle** — Warning threshold (default F ≥ 50): moderate risk
- **Red squiggle** — Error threshold (default F ≥ 150): high risk
- **Code Lens** — Inline metrics showing `CC: X, T: Y%, CRAP: Z, R: W, F: V` (configurable on/off)

Thresholds and color intensity can be adjusted in VS Code settings (see [Configuration](#configuration)).

---

## Installation & Setup

### Prerequisites by Language

#### **TypeScript, JavaScript, JSX, TSX**

1. **ESLint** (required for cyclomatic complexity)
   ```bash
   npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
   ```
   Or if already installed globally:
   ```bash
   npm list -g eslint
   ```

2. **Test Coverage** (optional, for test coverage metric `T`)
   - Generate an **LCOV coverage file** (`coverage/lcov.info`) using Jest, Vitest, or similar
   - Run: `npm test` or `pnpm test` with coverage enabled
   - Example Jest config:
     ```json
     {
       "collectCoverage": true,
       "coverageReporters": ["lcov", "text"]
     }
     ```

#### **Python**

1. **Radon** (required for cyclomatic complexity)
   ```bash
   pip install radon
   ```
   Or with conda:
   ```bash
   conda install -c conda-forge radon
   ```

2. **Test Coverage** (optional, for test coverage metric `T`)
   - Generate an **LCOV coverage file** using `coverage` + `coverage-lcov`:
     ```bash
     pip install coverage coverage-lcov
     python -m coverage run -m pytest
     python -m coverage lcov
     ```
   - Creates `coverage/lcov.info`

#### **Java**

1. **PMD** (required for cyclomatic complexity)
   - Download from [pmd.github.io](https://pmd.github.io/latest/) (version 6+)
   - Add PMD's `bin/` directory to your `PATH`, or specify the full path in VS Code settings

2. **Test Coverage** (optional, for test coverage metric `T`)
   - Generate an **LCOV coverage file** using JaCoCo + `jacoco-to-lcov-maven-plugin` or similar
   - Example Maven:
     ```xml
     <plugin>
       <groupId>org.jacoco</groupId>
       <artifactId>jacoco-maven-plugin</artifactId>
       <version>0.8.8</version>
       <executions>
         <execution>
           <goals>
             <goal>prepare-agent</goal>
             <goal>report</goal>
           </goals>
         </execution>
       </executions>
     </plugin>
     ```

### Configuration

Open VS Code **Settings** (Ctrl+,) and search for `ddp` to customize analysis behavior:

#### Coverage Settings
- **`ddp.coverage.fallbackT`** (number, default: `0`)
  - Test coverage percentage to use when no LCOV data is found (0–100)
  - Set to 0 to mark uncovered code as high-risk; set to 100 to assume well-covered

- **`ddp.coverage.lcovGlob`** (string, default: `"**/coverage/lcov.info"`)
  - Glob pattern to find LCOV coverage files
  - Example: `"coverage/lcov.info"` (single file) or `"**/coverage/lcov.info"` (any depth)

#### Cyclomatic Complexity Tool Paths
- **`ddp.cc.eslintPath`** (string, default: `"eslint"`)
  - Command or path to ESLint executable (for TypeScript/JavaScript)

- **`ddp.cc.pythonPath`** (string, default: `"python"`)
  - Command or path to Python executable (Radon will be run as `python -m radon cc`)

- **`ddp.cc.pmdPath`** (string, default: `"pmd"`)
  - Command or path to PMD executable (for Java)

- **`ddp.cc.useEslintForTsJs`** (boolean, default: `true`)
  - Whether to use ESLint for TypeScript/JavaScript CC (vs. fallback RegExp estimation)

#### Rank & Risk Scoring
- **`ddp.rank.maxIterations`** (number, default: `100`)
  - Maximum iterations for PageRank convergence; increase if rank values seem unstable

- **`ddp.rank.epsilon`** (number, default: `1e-6`)
  - Convergence threshold for PageRank; smaller = more precise, slower

#### Decoration & UI
- **`ddp.decoration.warnThreshold`** (number, default: `50`)
  - Failure risk threshold for yellow highlighting (warning)

- **`ddp.decoration.errorThreshold`** (number, default: `150`)
  - Failure risk threshold for red highlighting (error)

- **`ddp.fileRollup`** (string: `"max"` or `"sum"`, default: `"max"`)
  - How to derive file-level F from function-level F:
    - `"max"` — show the single riskiest function (highlights hotspots)
    - `"sum"` — show cumulative risk (highlights overall file load)

- **`ddp.codelens.enabled`** (boolean, default: `true`)
  - Show inline code lens with metrics on each function

- **`ddp.excludeTests`** (boolean, default: `true`)
  - Exclude test files (matching `*.test.*`, `*.spec.*`, `__tests__/`, `tests/`) from analysis

---

### Example Workspace Settings

Save this in `.vscode/settings.json` to customize your workspace:

```json
{
  "ddp.coverage.fallbackT": 0,
  "ddp.coverage.lcovGlob": "**/coverage/lcov.info",
  "ddp.cc.eslintPath": "eslint",
  "ddp.cc.pythonPath": "python",
  "ddp.cc.pmdPath": "pmd",
  "ddp.cc.useEslintForTsJs": true,
  "ddp.decoration.warnThreshold": 50,
  "ddp.decoration.errorThreshold": 150,
  "ddp.fileRollup": "max",
  "ddp.codelens.enabled": true,
  "ddp.excludeTests": true
}
```

---

## Development

### Testing the Extension

To debug and test the extension locally:

1. Open the project in VS Code: `code .`
2. Open `src/extension.ts`
3. Press **F5** or go **Run → Start Debugging**
   - A new VS Code window opens with the extension loaded
4. In that window, open your project/code to analyze
5. Run **`DDP: Analyse Workspace`** or **`DDP: Analyse Folder...`** (Shift+Ctrl+P)
6. Results appear in the **DDP Risks** sidebar panel

### Running Tests

```bash
npm test          # Run unit tests
npm run coverage  # Generate coverage report
npm run lint      # Run ESLint
```