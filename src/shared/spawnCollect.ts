import * as cp from "child_process";

export function spawnAndCollect(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve) => {
    const proc = cp.spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let isResolved = false;
    const finish = (output: string) => {
      if (!isResolved) {
        isResolved = true;
        resolve(output);
      }
    };
    const t = setTimeout(() => {
      proc.kill();
      finish("");
    }, timeoutMs);
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.on("close", () => {
      clearTimeout(t);
      finish(stdout);
    });
    proc.on("error", () => {
      clearTimeout(t);
      finish("");
    });
  });
}
