/**
 * Parses the stdout of:
 *   git log --name-only --pretty=format: --since=<date>
 * and returns a map of relative file path → commit count.
 */
export function parseGitLogToChurnCounts(stdout: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const path = line.trim();
    if (path) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}
