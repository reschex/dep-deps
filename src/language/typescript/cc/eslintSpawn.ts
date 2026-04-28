import { spawnAndCollect } from "../../../shared/spawnCollect";
import { parseEslintComplexityJson } from "./eslintParse";

export async function runEslintComplexity(
  eslintPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  const stdout = await spawnAndCollect(
    eslintPath,
    [fileFsPath, "-f", "json", "--no-error-on-unmatched-pattern", "--no-warn-ignored"],
    cwd,
    timeoutMs
  );
  return stdout ? parseEslintComplexityJson(stdout) : new Map();
}
