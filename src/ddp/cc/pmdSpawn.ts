import * as cp from "node:child_process";
import { parsePmdCyclomaticXml } from "./pmdParse";

/**
 * Run PMD on a single Java file and return Map<1-based line, CC>.
 *
 * Expects `pmdPath` to point to the PMD CLI executable (e.g. `pmd` or full path to `pmd.bat`/`pmd`).
 * PMD 7+ syntax: `pmd check -d <file> -R category/java/design.xml/CyclomaticComplexity -f xml`
 * PMD 6:         `pmd -d <file> -R category/java/design.xml -f xml`
 *
 * We request the full design category to catch all Cyclomatic variants and let the parser filter.
 */
export function runPmdCyclomaticComplexity(
  pmdPath: string,
  fileFsPath: string,
  cwd: string,
  timeoutMs: number
): Promise<Map<number, number>> {
  return new Promise((resolve) => {
    // PMD 7 uses `pmd check`; PMD 6 uses `pmd` directly.
    // Try PMD 7 syntax first (pmd check ...). If pmd is an alias for
    // the 6.x CLI this will still work with minor stderr noise.
    const args = [
      "check",
      "-d", fileFsPath,
      "-R", "category/java/design.xml",
      "-f", "xml",
      "--no-cache",
    ];

    const proc = cp.spawn(pmdPath, args, { cwd, windowsHide: true });
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
      // PMD exits with code 4 when violations are found — that's expected, not an error.
      finish(parsePmdCyclomaticXml(stdout));
    });
    proc.on("error", () => {
      clearTimeout(t);
      finish(new Map());
    });
  });
}
