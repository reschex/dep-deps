# BDD Scenarios — Dependable Dependencies Risk Extension

Living specification: each scenario maps to one or more automated tests.

---

## Feature: Rank computation

### Scenario: Simple star call graph

**Given** callee **M** is called directly by six methods each with converged rank 1
**When** rank iteration completes
**Then** **M**'s rank matches the paper's illustration (e.g. **1 + 6×1 = 7** after convergence rules encoded — verified against fixed test vectors extracted from the PDF examples).

### Scenario: Proportional split

**Given** caller **P** has rank 4 and calls three callees and no other inbound edges
**When** one iteration distributes rank
**Then** each callee receives **4/3** from **P** (plus any base accumulation per the chosen formalization — locked with a golden test so UI and docs stay consistent).

---

## Feature: CRAP and failure risk

### Scenario: CRAP with partial coverage

**Given** a method with **CC = 4**, **T = 0.3**
**When** CRAP is calculated
**Then** CRAP equals **(4² × (1 − 0.3)³) + 4** (≈ **9.744 + 4**).

### Scenario: Risk for paper's A/B/C-style example

**Given** fixed **R** and **CC**, **T** for units A, B, C as in the paper
**When** **F** is computed
**Then** **F** matches the paper's stated values (e.g. **F(C)** highest).

---

## Feature: Coverage mapping

### Scenario: Statement coverage maps to symbols

**Given** a `FileCoverage` result with statement ranges
**When** mapping to symbols
**Then** **T** for a function equals covered statements ∩ function body / total statements in body (define branch vs statement coverage in settings).

---

## Feature: JaCoCo XML coverage

### Scenario: JaCoCo XML enables the T metric

**As a** Java developer
**Given** I use JaCoCo to generate coverage XML files
**When** I analyse my code using DDP
**Then** I want the JaCoCo coverage XML to be enough to enable the test coverage metric (T) in the DDP extension.

### Scenario: Parse single-class JaCoCo report

**Given** a JaCoCo XML report containing one package with one source file and line-level coverage
**When** the report is parsed
**Then** each `<line>` element produces a `StatementCover` with `executed = ci > 0` and 0-based line numbers.

### Scenario: Parse multi-package JaCoCo report

**Given** a JaCoCo XML report with multiple `<package>` elements each containing source files
**When** the report is parsed
**Then** each source file is keyed by `packageName/sourceFileName` and all line entries are captured.

### Scenario: Empty or malformed JaCoCo XML

**Given** an empty string, whitespace-only string, or XML with no `<report>` element
**When** the parser runs
**Then** it returns an empty map without throwing.

### Scenario: JaCoCo coverage loads into CoverageStore

**Given** a workspace containing `**/jacoco.xml` coverage report files
**When** DDP analysis runs and coverage is loaded
**Then** the JaCoCo line coverage is ingested into the CoverageStore alongside any LCOV data, enabling the T metric for Java symbols.

---

## Feature: Sidebar risk list

### Scenario: Sort by F

**Given** an analyzed workspace
**When** the user opens the DDP sidebar and sorts by **F**
**Then** the highest-**F** symbols appear first and show file path.

### Scenario: Risk view displays analysis scope context

**Given** a workspace with multiple folders or a folder-scoped analysis running
**When** the user views the DDP risk list or risk tree
**Then** the view displays the analysis scope as either 'workspace' (for full workspace analysis) or the folder path being analyzed (for folder-scoped analysis).

### Scenario: Double-clicking a filename in the risk view opens that file

**Given** an analyzed workspace with risk results visible in the DDP sidebar
**When** the user double-clicks a filename in the risk view
**Then** the corresponding file is opened in the editor

---

## Feature: Editor decorations

### Scenario: High-risk decoration

**Given** configurable thresholds **warn** and **error**
**When** a file's **max(F)** exceeds **error**
**Then** the editor shows the high-risk decoration for that file.

---

## Feature: Inline breakdown

### Scenario: Hover shows metric breakdown

**Given** the cursor is on an analyzed symbol
**When** the user hovers (or reads CodeLens)
**Then** they see **R, CC, CRAP, T, F** and a short interpretation string.

---

## Feature: Missing data

### Scenario: No coverage data defaults to worst-case

**Given** no test coverage has been reported for the workspace
**When** analysis runs with fallback **T = 0**
**Then** CRAP reflects no coverage and the UI indicates coverage was not loaded (or "worst-case assumption").

---

## Feature: Folder-scoped analysis

### Scenario: Analyze only the selected folder

**Given** a workspace containing application code and large external dependency folders such as `node_modules`
**When** the user runs analysis and selects a specific source folder
**Then** symbol discovery, call-graph expansion, CC collection, coverage mapping, and UI results are limited to files rooted in that selected folder rather than the whole workspace.

### Scenario: Treat external modules as dependencies, not analysis targets

**Given** code inside the selected folder imports or calls into external modules outside the selected analysis root
**When** dependency edges are built
**Then** those external modules are represented as boundary dependencies for dependency/rank context without recursively analyzing their internal symbols, files, or transitive dependency trees.

### Scenario: Exclude dependency folders by default for JavaScript projects

**Given** a JavaScript or TypeScript workspace with `node_modules` present under the workspace root
**When** the user runs folder-scoped analysis on their application folder
**Then** the extension does not descend into `node_modules` unless the user explicitly selects that folder as the analysis root.
