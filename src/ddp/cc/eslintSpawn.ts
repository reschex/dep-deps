import * as cp from "child_process";
import { parseEslintComplexityJson } from "./eslintParse";

/**
 * Run ESLint with complexity rule messages; map line -> max reported complexity if parseable from message.
 */
export function runEslintComplexity(
  eslintPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  return new Promise((resolve) => {
    const proc = cp.spawn(
      eslintPath,
      [fileFsPath, "-f", "json", "--no-error-on-unmatched-pattern", "--no-warn-ignored"],
      { cwd, windowsHide: true }
    );
    let stdout = "";
    let done = false;
    const finish = (m: Map<number, number>) => {
      if (!done) {
        done = true;
        resolve(m);
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
      finish(parseEslintComplexityJson(stdout));
    });
    proc.on("error", () => {
      clearTimeout(t);
      finish(new Map());
    });
  });
}
