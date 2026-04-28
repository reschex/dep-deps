import { parseComplexityFromMessage } from "../../parseComplexity";

type EslintJson = { filePath?: string; messages?: { ruleId?: string; line?: number; message?: string }[] };

export function parseEslintComplexityJson(jsonText: string): Map<number, number> {
  const byLine = new Map<number, number>();
  try {
    const arr = JSON.parse(jsonText) as EslintJson[];
    if (!Array.isArray(arr)) {
      return byLine;
    }
    for (const file of arr) {
      for (const msg of file.messages ?? []) {
        const rid = msg.ruleId ?? "";
        if (
          (rid !== "complexity" && rid !== "@typescript-eslint/complexity") ||
          typeof msg.line !== "number"
        ) {
          continue;
        }
        const n = parseComplexityFromMessage(msg.message ?? "");
        if (n !== undefined) {
          const prev = byLine.get(msg.line) ?? 0;
          byLine.set(msg.line, Math.max(prev, n));
        }
      }
    }
  } catch {
    /* ignore */
  }
  return byLine;
}

export { parseComplexityFromMessage } from "../../parseComplexity";
