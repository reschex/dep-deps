import { runRadonCc } from "./radonSpawn";

export async function radonCcForFile(
  languageId: string,
  fsPath: string,
  cwd: string,
  pythonPath: string
): Promise<Map<string, number>> {
  if (languageId !== "python") {
    return new Map();
  }
  const RADON_TIMEOUT_MS = 15_000;
  return runRadonCc(pythonPath, fsPath, cwd, RADON_TIMEOUT_MS);
}
