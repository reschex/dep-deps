import * as vscode from "vscode";
import { parseJacocoToStatementCovers } from "../core/jacocoParse";
import { CoverageStore } from "../core/coverageStore";

/**
 * Load JaCoCo XML coverage reports into the store (additive — does NOT clear).
 *
 * JaCoCo file keys are of the form "com/example/Foo.java".
 * We resolve them to workspace file URIs by searching for matching paths in the workspace.
 */
export async function loadJacocoIntoStore(
  store: CoverageStore,
  pattern: string,
  token: vscode.CancellationToken
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return;
  }

  for (const folder of folders) {
    if (token.isCancellationRequested) {
      break;
    }
    await loadJacocoFromFolder(store, folder, pattern, token);
  }
}

async function loadJacocoFromFolder(
  store: CoverageStore,
  folder: vscode.WorkspaceFolder,
  pattern: string,
  token: vscode.CancellationToken
): Promise<void> {
  // 50 = generous upper bound on JaCoCo XML reports per folder (multi-module Maven/Gradle).
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, pattern),
    "**/node_modules/**",
    50
  );

  for (const file of files) {
    if (token.isCancellationRequested) {
      break;
    }
    const buf = await vscode.workspace.fs.readFile(file);
    const text = Buffer.from(buf).toString("utf8");
    const parsed = parseJacocoToStatementCovers(text);

    for (const [jacocoKey, stmts] of parsed) {
      const uri = await resolveJacocoSourceToUri(folder, jacocoKey);
      if (uri) {
        const existing = store.get(uri.toString());
        if (existing) {
          store.ingestStatementCovers(uri.toString(), [...existing, ...stmts]);
        } else {
          store.ingestStatementCovers(uri.toString(), stmts);
        }
      }
    }
  }
}

/**
 * Resolve a JaCoCo source key (e.g. "com/example/Foo.java") to a workspace file URI.
 * Uses findFiles to locate the file — works regardless of source root convention.
 */
async function resolveJacocoSourceToUri(
  folder: vscode.WorkspaceFolder,
  jacocoKey: string
): Promise<vscode.Uri | undefined> {
  const searchPattern = new vscode.RelativePattern(folder, `**/${jacocoKey}`);
  const matches = await vscode.workspace.findFiles(searchPattern, "**/node_modules/**", 2);
  if (matches.length > 1) {
    console.debug(`[DDP] Ambiguous JaCoCo source '${jacocoKey}': ${matches.length} matches, using first`);
  }
  return matches[0];
}
