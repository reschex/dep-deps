import type { StatementCover } from "./coverageMap";

/**
 * Minimal LCOV parser (SF + DA records) for line hit maps.
 * Line numbers in LCOV are 1-based; we emit 0-based startLine/endLine for core/coverageMap.
 */
export function parseLcovToStatementCovers(lcovText: string): Map<string, StatementCover[]> {
  const byFile = new Map<string, StatementCover[]>();
  let currentFile = "";
  for (const line of lcovText.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3).trim();
      continue;
    }
    if (line.trim() === "end_of_record") {
      currentFile = "";
      continue;
    }
    if (!currentFile || !line.startsWith("DA:")) {
      continue;
    }
    const stmt = parseDaRecord(line);
    if (stmt !== null) {
      appendStatement(byFile, currentFile, stmt);
    }
  }
  return byFile;
}

/**
 * Parse one `DA:<line>,<hits>` record into a StatementCover.
 * Returns null when the record is malformed, has a non-numeric field, or is line 0.
 */
function parseDaRecord(line: string): StatementCover | null {
  const rest = line.slice(3);
  const comma = rest.indexOf(",");
  if (comma < 0) {
    return null;
  }
  const lineNo = parseInt(rest.slice(0, comma), 10);
  const hits = parseInt(rest.slice(comma + 1), 10);
  if (Number.isNaN(lineNo) || Number.isNaN(hits) || lineNo < 1) {
    return null;
  }
  const zeroBased = lineNo - 1;
  return {
    executed: hits > 0,
    startLine: zeroBased,
    endLine: zeroBased,
  };
}

/** Append a statement to the per-file list, creating the bucket on first use. */
function appendStatement(
  byFile: Map<string, StatementCover[]>,
  filePath: string,
  stmt: StatementCover,
): void {
  let list = byFile.get(filePath);
  if (!list) {
    list = [];
    byFile.set(filePath, list);
  }
  list.push(stmt);
}

/** Merge multiple LCOV maps; statements for the same URI are concatenated. */
export function mergeLcovMaps(
  maps: ReadonlyArray<Map<string, StatementCover[]>>
): Map<string, StatementCover[]> {
  const out = new Map<string, StatementCover[]>();
  for (const map of maps) {
    for (const [filePath, stmts] of map) {
      const cur = out.get(filePath);
      out.set(filePath, cur ? [...cur, ...stmts] : [...stmts]);
    }
  }
  return out;
}
