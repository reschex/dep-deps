/**
 * Port interfaces for DDP analysis.
 *
 * These define the boundary between domain logic and infrastructure (VS Code, file system, etc.).
 * Infrastructure adapters implement these interfaces, allowing domain orchestration to be
 * tested with fakes and keeping the core portable across editors.
 */

import type { StatementCover } from "../core/coverageMap";
import type { CallEdge } from "../core/rank";

/** Minimal document abstraction for analysis — no VS Code dependency. */
export type DocumentInfo = {
  readonly uri: string;
  readonly languageId: string;
  readonly getText: (startLine: number, endLine: number) => string;
};

/** Minimal function symbol abstraction — no VS Code dependency. */
export type FunctionSymbolInfo = {
  readonly name: string;
  readonly selectionStartLine: number;
  readonly selectionStartCharacter: number;
  readonly bodyStartLine: number;
  readonly bodyEndLine: number;
};

/** Provides workspace file and document access. */
export interface DocumentProvider {
  /**
   * Find source files in the workspace.
   * @param maxFiles  Maximum number of files to return.
   * @param rootUri   Optional folder URI prefix — when set, only files whose URI starts with this prefix are returned.
   */
  findSourceFiles(maxFiles: number, rootUri?: string): Promise<string[]>;
  openDocument(uri: string): Promise<DocumentInfo | undefined>;
}

/** Provides function-level symbols for a document. */
export interface SymbolProvider {
  getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]>;
}

/** Provides call graph edges for the workspace. */
export interface CallGraphProvider {
  /**
   * Collect call edges.
   * @param maxFiles  Maximum number of files to scan for call hierarchy roots.
   * @param rootUri   Optional folder URI prefix — when set, only files under this root are scanned for call hierarchy roots. Edges pointing to symbols outside the root are still returned (boundary dependencies) but those targets are not recursively expanded.
   */
  collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]>;
}

/** Provides statement-level coverage data by file URI. */
export interface CoverageProvider {
  loadCoverage(): Promise<void>;
  getStatements(uri: string): StatementCover[] | undefined;
}

/** Provides cyclomatic complexity per function for a document. */
export interface CyclomaticComplexityProvider {
  /** Returns a map from function key to CC. Key format is provider-specific. */
  computeComplexity(doc: DocumentInfo): Promise<CcResult>;
}

/** Result of CC analysis for a single document. */
export type CcResult = {
  /** CC indexed by 1-based line number (ESLint, PMD style). */
  readonly byLine: Map<number, number>;
  /** CC indexed by "lineno:name" (Radon style). */
  readonly byName: Map<string, number>;
};

/** Provides git commit frequency data for churn-weighted risk scoring. */
export interface ChurnProvider {
  /**
   * Returns commit count within the look-back window, keyed by file URI string
   * (absolute, scheme-qualified e.g. `file:///c%3A/code/proj/src/foo.ts`).
   * Adapters are responsible for converting git-relative paths to workspace-absolute
   * URIs before returning. Files absent from the map have not been touched (G = 1).
   */
  getChurnCounts(since: Date): Promise<Map<string, number>>;
}

/** Logging port — allows domain code to log without depending on VS Code output channels. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
  /** Optional debug-level log — emitted for detailed diagnostic output (file discovery, symbol extraction). */
  debug?(message: string): void;
}

/** No-op logger for tests and contexts where logging isn't needed. */
export const nullLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};
