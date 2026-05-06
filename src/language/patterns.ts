/**
 * Shared language patterns — file discovery globs and test-file detection.
 *
 * Single source of truth for which files to analyze and which to exclude.
 * Consumed by both VS Code and CLI adapters.
 */

/** Default glob for source files to analyze. */
export const SOURCE_FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}";

/** Glob pattern for directories to exclude from file discovery. */
export const EXCLUDE_GLOB = "**/node_modules/**";

// ─── Language ID detection ──────────────────────────────────────────────────

/** Map file extension (lowercase, with dot) to VS Code-compatible language ID. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
};

/**
 * Detect language ID from a file URI or path based on its extension.
 * Returns 'unknown' for unrecognized extensions.
 */
export function detectLanguageId(uriOrPath: string): string {
  const match = /\.([a-z]+)$/i.exec(uriOrPath);
  if (!match) return 'unknown';
  const ext = `.${match[1].toLowerCase()}`;
  return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}
