import * as vscode from "vscode";
import { parseJacocoToStatementCovers } from "../../core/jacocoParse";
import { CoverageStore } from "../../core/coverageStore";

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

  // Build a cache of source files upfront (O(1) lookups instead of O(n) findFiles per source)
  const sourceFileCache = await buildSourceFileCache(folder, token);

  for (const file of files) {
    if (token.isCancellationRequested) {
      break;
    }
    const buf = await vscode.workspace.fs.readFile(file);
    const text = Buffer.from(buf).toString("utf8");
    const parsed = parseJacocoToStatementCovers(text);

    for (const [jacocoKey, stmts] of parsed) {
      const uri = resolveJacocoSourceFromCache(folder, jacocoKey, sourceFileCache);
      if (uri) {
        const existing = store.get(uri);
        if (existing) {
          store.ingestStatementCovers(uri, [...existing, ...stmts]);
        } else {
          store.ingestStatementCovers(uri, stmts);
        }
      }
    }
  }
}

/**
 * Build a cache of all .java source files in the folder for O(1) lookup by path.
 * Maps paths like "com/example/Foo.java" and "src/main/java/com/example/Foo.java" to their URIs.
 * Tracks ambiguous file names (multiple files with same name) for logging.
 */
async function buildSourceFileCache(
  folder: vscode.WorkspaceFolder,
  token: vscode.CancellationToken
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const fileNameToUris = new Map<string, string[]>(); // Track duplicates for logging

  // Find all .java files once — this replaces the N × findFiles calls
  const sourceFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.java"),
    "**/node_modules/**"
  );

  for (const uri of sourceFiles) {
    if (token.isCancellationRequested) {
      break;
    }
    // Cache by relative path (normalized for JaCoCo format)
    const relativePath = vscode.workspace.asRelativePath(uri);
    // Normalize both forward and back slashes to forward slashes (JaCoCo format)
    const normalizedPath = relativePath.replace(/\\/g, "/");
    cache.set(normalizedPath, uri.toString());

    // Also cache by file name for simple cases (e.g., "Foo.java" → URI)
    // and track duplicates for later logging
    const fileName = normalizedPath.split("/").pop();
    if (fileName) {
      if (!fileNameToUris.has(fileName)) {
        fileNameToUris.set(fileName, []);
      }
      fileNameToUris.get(fileName)!.push(uri.toString());
    }
  }

  // Pre-mark ambiguous file names for logging later
  for (const [fileName, uris] of fileNameToUris) {
    if (uris.length > 1) {
      // Store special marker: store URI list as JSON string
      cache.set(`__ambiguous__${fileName}`, JSON.stringify(uris));
    } else {
      cache.set(fileName, uris[0]);
    }
  }

  return cache;
}

/**
 * Resolve a JaCoCo source key (e.g. "com/example/Foo.java") to a workspace file URI
 * using the pre-built cache instead of findFiles.
 */
function resolveJacocoSourceFromCache(
  folder: vscode.WorkspaceFolder,
  jacocoKey: string,
  cache: Map<string, string>
): string | undefined {
  // Try exact match first
  if (cache.has(jacocoKey)) {
    const val = cache.get(jacocoKey)!;
    // Check if this is an ambiguity marker
    if (val.startsWith('[')) {
      const uris = JSON.parse(val) as string[];
      console.debug(`[DDP] Ambiguous JaCoCo source '${jacocoKey}': ${uris.length} matches, using first`);
      return uris[0];
    }
    return val;
  }

  // Try file name only (last segment)
  const fileName = jacocoKey.split("/").pop();
  if (fileName) {
    const ambiguityKey = `__ambiguous__${fileName}`;
    if (cache.has(ambiguityKey)) {
      const uris = JSON.parse(cache.get(ambiguityKey)!) as string[];
      console.debug(`[DDP] Ambiguous JaCoCo source '${jacocoKey}': ${uris.length} matches, using first`);
      return uris[0];
    }
    if (cache.has(fileName)) {
      return cache.get(fileName);
    }
  }

  return undefined;
}
