import { runEslintComplexity } from "./eslintSpawn";

const jsLangs = new Set(["javascript", "typescript", "javascriptreact", "typescriptreact"]);

export async function eslintCcForFile(
  languageId: string,
  fsPath: string,
  cwd: string,
  eslintPath: string
): Promise<Map<number, number>> {
  if (!jsLangs.has(languageId)) {
    return new Map();
  }
  return runEslintComplexity(eslintPath, fsPath, cwd, 20000);
}
