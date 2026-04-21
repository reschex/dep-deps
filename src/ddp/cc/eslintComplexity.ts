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
  const ESLINT_TIMEOUT_MS = 20_000;
  return runEslintComplexity(eslintPath, fsPath, cwd, ESLINT_TIMEOUT_MS);
}
