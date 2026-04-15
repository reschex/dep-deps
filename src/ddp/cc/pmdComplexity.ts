import { runPmdCyclomaticComplexity } from "./pmdSpawn";

/**
 * Get cyclomatic complexity per method line for a Java document using PMD.
 * Returns Map<1-based line number, CC>.
 */
export async function pmdCcForFile(
  languageId: string,
  fsPath: string,
  cwd: string,
  pmdPath: string
): Promise<Map<number, number>> {
  if (languageId !== "java") {
    return new Map();
  }
  return runPmdCyclomaticComplexity(pmdPath, fsPath, cwd, 30000);
}
