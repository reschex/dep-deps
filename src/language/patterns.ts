/**
 * Shared language patterns — file discovery globs and test-file detection.
 *
 * Single source of truth for which files to analyze and which to exclude.
 * Consumed by both VS Code and CLI adapters.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

/** Default glob for source files to analyze. */
export const SOURCE_FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}";

/**
 * Convert a `file://` URI or absolute path to an OS file system path.
 * Pass-through for non-URI inputs so callers can accept either form.
 */
export function toFilePath(uriOrPath: string): string {
  return uriOrPath.startsWith('file://') ? fileURLToPath(uriOrPath) : uriOrPath;
}

/**
 * Normalize a `file://` URI or absolute path to a `file://` URI string.
 * Pass-through for inputs already in URI form.
 */
export function toFileUri(uriOrPath: string): string {
  return uriOrPath.startsWith('file://') ? uriOrPath : pathToFileURL(uriOrPath).toString();
}

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

const TYPESCRIPT_JAVASCRIPT_LANGUAGE_IDS: ReadonlySet<string> = new Set([
  'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
]);

/**
 * Predicate for the TypeScript/JavaScript language family.
 * Single source of truth shared by symbol, call graph, and CC providers.
 */
export function isTypescriptOrJavascript(languageId: string): boolean {
  return TYPESCRIPT_JAVASCRIPT_LANGUAGE_IDS.has(languageId);
}
