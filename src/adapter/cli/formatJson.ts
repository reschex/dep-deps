/**
 * JSON output formatter for CLI analysis results.
 *
 * Serialises AnalysisResult into the documented JSON schema:
 *   { timestamp, summary, files: [{ uri, path, rollupScore, symbols }] }
 *
 * Paths are converted from absolute file:// URIs to workspace-relative paths
 * for portability across machines.
 */

import type { AnalysisResult } from '../../adapter/vscode/analysisOrchestrator';
import type { SymbolMetrics } from '../../core/analyze';

/** Top-level JSON output schema. */
export type JsonOutput = {
  readonly timestamp: string;
  readonly summary: JsonSummary;
  readonly files: readonly JsonFile[];
};

export type JsonSummary = {
  readonly filesAnalyzed: number;
  readonly symbolsAnalyzed: number;
  readonly averageCC: number;
};

export type JsonFile = {
  readonly uri: string;
  readonly path: string;
  readonly rollupScore: number;
  readonly symbols: readonly JsonSymbol[];
};

export type JsonSymbol = {
  readonly name: string;
  readonly cc: number;
  readonly t: number;
  readonly crap: number;
  readonly r: number;
  readonly f: number;
  readonly g: number;
  readonly fPrime: number;
};

/**
 * Format an AnalysisResult as a JSON string conforming to the DDP output schema.
 *
 * @param result        The completed analysis result.
 * @param workspaceRoot Absolute path (no trailing slash) to strip from URIs for relative paths.
 * @returns Prettified JSON string.
 */
export function formatAnalysisAsJson(
  result: AnalysisResult,
  workspaceRoot: string,
  clock: () => Date = () => new Date(),
): string {
  const symbolsByUri = groupSymbolsByUri(result.symbols);
  const uris = [...symbolsByUri.keys()];

  // Sort files by rollup score descending (highest risk first)
  uris.sort((a, b) => (result.fileRollup.get(b) ?? 0) - (result.fileRollup.get(a) ?? 0));

  const files: JsonFile[] = uris.map((uri) => ({
    uri,
    path: uriToRelativePath(uri, workspaceRoot),
    rollupScore: result.fileRollup.get(uri) ?? 0,
    symbols: (symbolsByUri.get(uri) ?? []).map(toJsonSymbol),
  }));

  const averageCC =
    result.symbols.length > 0
      ? result.symbols.reduce((sum, s) => sum + s.cc, 0) / result.symbols.length
      : 0;

  const output: JsonOutput = {
    timestamp: clock().toISOString(),
    summary: {
      filesAnalyzed: files.length,
      symbolsAnalyzed: result.symbols.length,
      averageCC: round(averageCC, 2),
    },
    files,
  };

  return JSON.stringify(output, null, 2);
}

function groupSymbolsByUri(symbols: readonly SymbolMetrics[]): Map<string, SymbolMetrics[]> {
  const map = new Map<string, SymbolMetrics[]>();
  for (const sym of symbols) {
    let list = map.get(sym.uri);
    if (!list) {
      list = [];
      map.set(sym.uri, list);
    }
    list.push(sym);
  }
  return map;
}

function toJsonSymbol(sym: SymbolMetrics): JsonSymbol {
  return {
    name: sym.name,
    cc: sym.cc,
    t: round(sym.t, 4),
    crap: round(sym.crap, 4),
    r: round(sym.r, 4),
    f: round(sym.f, 4),
    g: round(sym.g, 4),
    fPrime: round(sym.fPrime, 4),
  };
}

/**
 * Convert a file:// URI to a workspace-relative path.
 * Works correctly on both POSIX and Windows without invoking the OS path resolver,
 * so POSIX-style test data works even when tests run on Windows.
 *
 * e.g. "file:///workspace/src/utils.ts" with root "/workspace" → "src/utils.ts"
 * e.g. "file:///C%3A/code/proj/src/utils.ts" with root "C:\code\proj" → "src/utils.ts"
 *
 * Strategy: decode the URL pathname (always /-separated, percent-encoded),
 * then normalise the workspace root to the same URL-path form for comparison.
 * Windows roots like "C:\code\proj" become "/C:/code/proj" in URL path form.
 */
function uriToRelativePath(uri: string, workspaceRoot: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:') { return uri; }

    // URL.pathname is /-separated and percent-encoded; decode to compare with roots.
    const decodedPathname = decodeURIComponent(url.pathname);

    // Normalise workspaceRoot: backslashes → forward-slashes.
    // Add leading '/' if missing (converts Windows "C:/..." to "/C:/...").
    const normalRoot = workspaceRoot.replace(/\\/g, '/');
    const urlRoot = normalRoot.startsWith('/') ? normalRoot : `/${normalRoot}`;
    const urlRootWithSlash = urlRoot.endsWith('/') ? urlRoot : `${urlRoot}/`;

    if (decodedPathname.startsWith(urlRootWithSlash)) {
      return decodedPathname.slice(urlRootWithSlash.length);
    }
  } catch {
    // uri is not a valid URL — fall through to raw return
  }
  return uri;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
