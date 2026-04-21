import { spawnAndCollect } from "../spawnCollect";
import { parseRadonCcJson } from "./radonParse";

export async function runRadonCc(
  pythonPath: string,
  filePath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<string, number>> {
  const stdout = await spawnAndCollect(
    pythonPath,
    ["-m", "radon", "cc", "-j", filePath],
    cwd,
    timeoutMs
  );
  return stdout ? parseRadonCcJson(stdout, filePath) : new Map();
}
