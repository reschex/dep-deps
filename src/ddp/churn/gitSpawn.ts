import * as cp from "child_process";

export function runGitLog(repoRoot: string, since: Date, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = cp.spawn(
      "git",
      ["log", "--name-only", "--pretty=format:", `--since=${since.toISOString()}`, "--diff-filter=ACDMR"],
      { cwd: repoRoot, windowsHide: true }
    );
    let stdout = "";
    let done = false;
    const finish = (output: string) => {
      if (!done) {
        done = true;
        resolve(output);
      }
    };
    const t = setTimeout(() => {
      proc.kill();
      finish("");
    }, timeoutMs);
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.on("close", () => { clearTimeout(t); finish(stdout); });
    proc.on("error", () => { clearTimeout(t); finish(""); });
  });
}
