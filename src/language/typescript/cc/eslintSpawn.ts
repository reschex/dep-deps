import { spawnAndCollect } from "../../../shared/spawnCollect";
import { parseEslintComplexityJson } from "./eslintParse";

/**
 * Split a command string into [executable, prefixArgs].
 *
 * Handles multi-word commands like "npx eslint" → ["npx", ["eslint"]].
 * Paths with embedded spaces (e.g. "C:\Program Files\...\eslint") are
 * left intact — detected by path separators in the first token.
 *
 * Constraint: a first token containing a path separator is treated as a
 * whole-path executable, so a relative path followed by flags
 * (e.g. "node_modules/.bin/eslint --cache") is NOT split — the entire
 * string becomes the exe and the spawn fails. Use a bare command + args
 * ("npx eslint") or a separator-free executable for the multi-word form.
 */
function splitCommand(cmd: string): [string, string[]] {
  const trimmed = cmd.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return [trimmed, []];
  const first = trimmed.slice(0, spaceIdx);
  // Path with embedded space: first token contains / or \  → pass through as-is
  if (first.includes("/") || first.includes("\\")) return [trimmed, []];
  const rest = trimmed.slice(spaceIdx + 1).trim();
  return [first, rest ? rest.split(/\s+/) : []];
}

export async function runEslintComplexity(
  eslintPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  const [exe, prefixArgs] = splitCommand(eslintPath);
  const stdout = await spawnAndCollect(
    exe,
    [...prefixArgs, fileFsPath, "-f", "json", "--no-error-on-unmatched-pattern", "--no-warn-ignored"],
    cwd,
    timeoutMs
  );
  return stdout ? parseEslintComplexityJson(stdout) : new Map();
}
