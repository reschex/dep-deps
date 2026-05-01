import { spawnAndCollect } from "../../../shared/spawnCollect";
import { parsePmdCyclomaticXml } from "./pmdParse";

/**
 * Spawn PMD and return the raw XML output as a string.
 * Shared by both CC parsing and symbol extraction.
 */
export function runPmdRaw(
  pmdPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<string> {
  return spawnAndCollect(
    pmdPath,
    ["check", "-d", fileFsPath, "-R", "category/java/design.xml", "-f", "xml", "--no-cache"],
    cwd,
    timeoutMs
  );
}

export function runPmdCyclomaticComplexity(
  pmdPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  return runPmdRaw(pmdPath, fileFsPath, cwd, timeoutMs)
    .then((stdout) => stdout ? parsePmdCyclomaticXml(stdout) : new Map());
}
