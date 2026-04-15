import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      "--disable-extensions",       // avoid interference from other extensions
      "--disable-gpu",              // headless-friendly
    ],
  });
}

main().catch((err) => {
  console.error("Failed to run extension tests:", err);
  process.exit(1);
});
