/**
 * Error-handling tests for loadGitignoreFilter.
 *
 * These tests mock node:fs/promises to simulate error conditions that
 * cannot be reliably reproduced with real file I/O cross-platform
 * (e.g. EACCES permission denied).
 *
 * Kept in a separate file so the real-I/O tests in gitignoreFilter.test.ts
 * are not affected by the module-level mock.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn() };
});

import { readFile } from "node:fs/promises";
import { loadGitignoreFilter } from "./gitignoreFilter";

describe("loadGitignoreFilter — error handling", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
  });

  it("returns nullFilter when .gitignore is not found (ENOENT)", async () => {
    // Given readFile throws ENOENT
    const notFound = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    vi.mocked(readFile).mockRejectedValueOnce(notFound);

    // When I load the gitignore filter
    const filter = await loadGitignoreFilter("/some/project");

    // Then it should silently return nullFilter (missing gitignore is expected)
    expect(filter("generated/output.ts")).toBe(false);
  });

  it("rethrows errors that are not ENOENT (e.g. EACCES)", async () => {
    // Given readFile throws a permission-denied error
    const permError = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    vi.mocked(readFile).mockRejectedValueOnce(permError);

    // When I try to load the gitignore filter
    // Then it should surface the error — silently returning nullFilter would hide a real problem
    await expect(loadGitignoreFilter("/some/project")).rejects.toThrow("Permission denied");
  });
});
