import { runEslintComplexity } from "./eslintSpawn";

export function isJsLanguage(languageId: string): boolean {
  return (
    languageId === "javascript" ||
    languageId === "typescript" ||
    languageId === "javascriptreact" ||
    languageId === "typescriptreact"
  );
}

export async function eslintCcForFile(
  languageId: string,
  fsPath: string,
  cwd: string,
  eslintPath: string
): Promise<Map<number, number>> {
  if (!isJsLanguage(languageId)) {
    return new Map();
  }
  return runEslintComplexity(eslintPath, fsPath, cwd, 20000);
}
