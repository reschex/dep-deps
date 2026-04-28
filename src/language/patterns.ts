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

/** Test-file name pattern: matches .test. or .spec. before the final extension. */
const TEST_FILE_RE = /\.(?:test|spec)\.[^/\\]+$/i;

/** Java convention: class name ending in Test/Tests/IT before the extension. */
const JAVA_TEST_RE = /(?:Test|Tests|IT)\.[^/\\]+$/;

/** Test-directory segments that indicate a test folder. */
const TEST_DIR_RE = /(?:^|[/\\])(?:__tests__|tests?|test_[^/\\]+)(?:[/\\]|$)/i;

/**
 * Pure check: does a URI (or file path) look like a test file?
 * Matches common conventions across JS/TS/Python/Java.
 */
export function isTestFileUri(uri: string): boolean {
  return TEST_FILE_RE.test(uri) || JAVA_TEST_RE.test(uri) || TEST_DIR_RE.test(uri);
}
