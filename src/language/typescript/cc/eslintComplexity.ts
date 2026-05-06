import { runEslintComplexity } from "./eslintSpawn";
import { isTypescriptOrJavascript } from "../../patterns";

export function isJsLanguage(languageId: string): boolean {
  return isTypescriptOrJavascript(languageId);
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
