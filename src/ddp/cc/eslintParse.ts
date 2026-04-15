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

/** ESLint complexity message often like "Function 'foo' has a complexity of 12." */
export function parseComplexityFromMessage(message: string): number | undefined {
  const m = message.match(/complexity of (\d+)/i);
  if (m) {
    return parseInt(m[1], 10);
  }
  return undefined;
}
