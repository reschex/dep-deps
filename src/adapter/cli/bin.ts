#!/usr/bin/env node
/**
 * CLI executable entry point.
 *
 * Thin wrapper — all logic lives in main() which is fully unit-tested.
 * This file only bridges process globals into the testable CliContext.
 *
 * TDD exception: no test for this file — it contains zero branching logic.
 * The main() function it delegates to has full test coverage.
 */

import { main } from './main';

main({
  argv: process.argv,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
}).then((code) => {
  process.exitCode = code;
}).catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
