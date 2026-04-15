import type { StatementCover } from "./coverageMap";

/**
 * Minimal LCOV parser (SF + DA records) for line hit maps.
 * Line numbers in LCOV are 1-based; we emit 0-based startLine/endLine for core/coverageMap.
 */
export function parseLcovToStatementCovers(lcovText: string): Map<string, StatementCover[]> {
  const byFile = new Map<string, StatementCover[]>();
  let currentFile = "";
  const lines = lcovText.split(/\r?\n/);
  for (const line of lines) {
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
    const rest = line.slice(3);
    const comma = rest.indexOf(",");
    if (comma < 0) {
      continue;
    }
    const lineNo = parseInt(rest.slice(0, comma), 10);
    const hits = parseInt(rest.slice(comma + 1), 10);
    if (Number.isNaN(lineNo) || Number.isNaN(hits) || lineNo < 1) {
      continue;
    }
    const zeroBased = lineNo - 1;
    const stmt: StatementCover = {
      executed: hits > 0,
      startLine: zeroBased,
      endLine: zeroBased,
    };
    let list = byFile.get(currentFile);
    if (!list) {
      list = [];
      byFile.set(currentFile, list);
    }
    list.push(stmt);
  }
  return byFile;
}

/** Merge multiple LCOV maps; statements for the same URI are concatenated. */
export function mergeLcovMaps(
  maps: ReadonlyArray<Map<string, StatementCover[]>>
): Map<string, StatementCover[]> {
  const out = new Map<string, StatementCover[]>();
  for (const m of maps) {
    for (const [k, v] of m) {
      const cur = out.get(k);
      out.set(k, cur ? [...cur, ...v] : [...v]);
    }
  }
  return out;
}
