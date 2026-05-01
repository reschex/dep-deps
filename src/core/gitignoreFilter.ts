/**
 * Gitignore-based file filtering.
 *
 * Loads .gitignore from a project root and returns a predicate
 * that tests whether a workspace-relative path is ignored.
 *
 * Uses the `ignore` package (standard .gitignore spec compliance).
 */

import ignore from "ignore";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A predicate that returns `true` when a workspace-relative path is ignored.
 * Paths should use forward-slash separators and be relative to the workspace root.
 */
export type GitignoreFilter = (relativePath: string) => boolean;

/**
 * A predicate that returns `true` when a file URI should be excluded from analysis.
 *
 * Semantically distinct from `GitignoreFilter`: this operates on full file URIs
 * (e.g. `file:///project/src/main.ts`) rather than workspace-relative paths.
 *
 * Note: URI matching is case-sensitive and encoding-sensitive. Both the root URI
 * and file URIs must use consistent encoding (e.g. both percent-encoded or both not).
 * In VS Code on Windows, use `vscode.Uri.toString()` consistently for both sides.
 */
export type UriFilter = (uri: string) => boolean;

/** Filter that ignores nothing — used when gitignore is disabled or missing. */
export const nullFilter: GitignoreFilter = () => false;

/**
 * Compose a `GitignoreFilter` (relative-path predicate) with a root URI
 * to produce a `UriFilter` suitable for `OrchestratorDeps.gitignoreFilter`.
 *
 * Returns `true` when the file URI is under `rootUri` and the relative path is ignored.
 * Returns `false` for URIs outside the root prefix (they cannot be matched).
 */
export function makeUriFilter(rootUri: string, filter: GitignoreFilter): UriFilter {
  const prefix = rootUri.endsWith("/") ? rootUri : rootUri + "/";
  return (uri: string) => {
    if (!uri.startsWith(prefix)) {
      return false;
    }
    const relativePath = uri.slice(prefix.length);
    return filter(relativePath);
  };
}

/**
 * Load `.gitignore` from `rootPath` and return a filter predicate.
 *
 * Returns `nullFilter` (ignores nothing) when the file does not exist (ENOENT).
 * All other I/O errors (e.g. EACCES) are rethrown — a permission error means
 * the user enabled gitignore filtering but the filter cannot be applied, which
 * should surface rather than silently degrade.
 */
export async function loadGitignoreFilter(rootPath: string): Promise<GitignoreFilter> {
  const gitignorePath = join(rootPath, ".gitignore");
  let content: string;
  try {
    content = await readFile(gitignorePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return nullFilter;
    }
    throw err;
  }

  const ig = ignore().add(content);
  return (relativePath: string) => ig.ignores(relativePath);
}
