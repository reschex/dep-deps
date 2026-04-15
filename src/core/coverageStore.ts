import type { StatementCover } from "./coverageMap";

/**
 * Holds statement-level coverage keyed by file URI string.
 * No VS Code dependency — testable with vitest.
 */
export class CoverageStore {
  private readonly byUri = new Map<string, StatementCover[]>();

  clear(): void {
    this.byUri.clear();
  }

  get(uri: string): StatementCover[] | undefined {
    // Try exact match first
    const result = this.byUri.get(uri);
    if (result) {
      return result;
    }

    // On Windows, try case-insensitive match as fallback
    // URI strings may have different encoding between different code paths
    if (process.platform === "win32") {
      const keyLower = uri.toLowerCase();
      for (const [storedKey, statements] of this.byUri) {
        if (storedKey.toLowerCase() === keyLower) {
          return statements;
        }
      }
    }

    return undefined;
  }

  /** Store statement coverage records for a file URI. */
  ingestStatementCovers(uriString: string, statements: readonly StatementCover[]): void {
    this.byUri.set(uriString, [...statements]);
  }
}
