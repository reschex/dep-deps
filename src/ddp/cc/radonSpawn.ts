import * as cp from "child_process";
import { parseRadonCcJson } from "./radonParse";

export function runRadonCc(
  pythonPath: string,
  filePath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    const proc = cp.spawn(pythonPath, ["-m", "radon", "cc", "-j", filePath], {
      cwd,
      windowsHide: true,
    });
    let stdout = "";
    let done = false;
    const finish = (map: Map<string, number>) => {
      if (!done) {
        done = true;
        resolve(map);
      }
    };
    const t = setTimeout(() => {
      proc.kill();
      finish(new Map());
    }, timeoutMs);
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.on("close", () => {
      clearTimeout(t);
      finish(parseRadonCcJson(stdout, filePath));
    });
    proc.on("error", () => {
      clearTimeout(t);
      finish(new Map());
    });
  });
}
