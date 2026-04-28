import { fileURLToPath } from "url";
import { parseGitLogToChurnCounts } from "../../../core/churnParse";
import type { ChurnProvider } from "../../../core/ports";
import { runGitLog } from "./gitSpawn";

const GIT_TIMEOUT_MS = 15_000;

export class GitChurnAdapter implements ChurnProvider {
  private readonly repoRootFs: string;
  private readonly repoRootUri: string;

  constructor(repoRootUri: string) {
    this.repoRootUri = repoRootUri.replace(/\/$/, "");
    try {
      this.repoRootFs = fileURLToPath(repoRootUri);
    } catch {
      throw new TypeError(`GitChurnAdapter: invalid repo root URI "${repoRootUri}"`);
    }
  }

  async getChurnCounts(since: Date): Promise<Map<string, number>> {
    const stdout = await runGitLog(this.repoRootFs, since, GIT_TIMEOUT_MS);
    const relativeCounts = parseGitLogToChurnCounts(stdout);
    const uriCounts = new Map<string, number>();
    for (const [relativePath, count] of relativeCounts) {
      // git always uses forward slashes — safe to concatenate directly with URI base
      uriCounts.set(`${this.repoRootUri}/${relativePath}`, count);
    }
    return uriCounts;
  }
}
