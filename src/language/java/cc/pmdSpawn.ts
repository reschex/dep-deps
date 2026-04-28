import { spawnAndCollect } from "../../../shared/spawnCollect";
import { parsePmdCyclomaticXml } from "./pmdParse";

export function runPmdCyclomaticComplexity(
  pmdPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  return spawnAndCollect(
    pmdPath,
    ["check", "-d", fileFsPath, "-R", "category/java/design.xml", "-f", "xml", "--no-cache"],
    cwd,
    timeoutMs
  ).then((stdout) => stdout ? parsePmdCyclomaticXml(stdout) : new Map());
}
