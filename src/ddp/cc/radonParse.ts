import * as path from "path";

/**
 * Parse `radon cc -j` output for a single file (object keyed by path).
 */
export function parseRadonCcJson(jsonText: string, absFilePath: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const root = JSON.parse(jsonText) as Record<string, unknown>;
    const resolvedTarget = path.resolve(absFilePath);
    for (const filePath of Object.keys(root)) {
      if (path.resolve(filePath) !== resolvedTarget) {
        continue;
      }
      const blocks = root[filePath];
      if (!Array.isArray(blocks)) {
        continue;
      }
      for (const b of blocks as { name?: string; lineno?: number; complexity?: number }[]) {
        if (typeof b.name === "string" && typeof b.complexity === "number" && typeof b.lineno === "number") {
          const key = `${b.lineno}:${b.name}`;
          out.set(key, b.complexity);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
