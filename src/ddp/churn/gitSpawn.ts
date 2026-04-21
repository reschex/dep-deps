import { spawnAndCollect } from "../spawnCollect";

export function runGitLog(repoRoot: string, since: Date, timeoutMs: number): Promise<string> {
  return spawnAndCollect(
    "git",
    ["log", "--name-only", "--pretty=format:", `--since=${since.toISOString()}`, "--diff-filter=ACDMR"],
    repoRoot,
    timeoutMs
  );
}
