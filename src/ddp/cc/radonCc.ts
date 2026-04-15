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
  return runRadonCc(pythonPath, fsPath, cwd, 15000);
}
