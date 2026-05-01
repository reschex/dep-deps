/**
 * Tests for .gitignore-based file filtering.
 *
 * Scenario: Respect .gitignore patterns when configured
 * Scenario: Missing .gitignore handled gracefully
 * From: features/file-discovery.feature
 */

import { describe, it, expect } from "vitest";
import { join } from "path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadGitignoreFilter, nullFilter, makeUriFilter } from "./gitignoreFilter";

describe("loadGitignoreFilter", () => {
  it("returns a filter that rejects paths matching .gitignore patterns", async () => {
    // Given a directory with a .gitignore file
    const dir = await mkdtemp(join(tmpdir(), "ddp-gitignore-"));
    try {
      await writeFile(join(dir, ".gitignore"), "generated/\n*.generated.ts\n");

      // When I load the gitignore filter
      const filter = await loadGitignoreFilter(dir);

      // Then matched paths should be rejected
      expect(filter("generated/output.ts")).toBe(true);
      expect(filter("src/foo.generated.ts")).toBe(true);

      // And non-matched paths should be accepted
      expect(filter("src/utils.ts")).toBe(false);
      expect(filter("src/main.ts")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns nullFilter when .gitignore does not exist", async () => {
    // Given a directory with no .gitignore
    const dir = await mkdtemp(join(tmpdir(), "ddp-no-gitignore-"));
    try {
      const filter = await loadGitignoreFilter(dir);

      // Then the filter should reject nothing
      expect(filter("anything.ts")).toBe(false);
      expect(filter("generated/output.ts")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles empty .gitignore gracefully", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ddp-empty-gitignore-"));
    try {
      await writeFile(join(dir, ".gitignore"), "");

      const filter = await loadGitignoreFilter(dir);

      expect(filter("src/utils.ts")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("respects negation patterns in .gitignore", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ddp-negate-gitignore-"));
    try {
      await writeFile(join(dir, ".gitignore"), "*.log\n!important.log\n");

      const filter = await loadGitignoreFilter(dir);

      expect(filter("debug.log")).toBe(true);
      expect(filter("important.log")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores comment lines in .gitignore", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ddp-comment-gitignore-"));
    try {
      await writeFile(join(dir, ".gitignore"), "# This is a comment\ndist/\n");

      const filter = await loadGitignoreFilter(dir);

      expect(filter("dist/bundle.js")).toBe(true);
      // The comment itself should not create a filter rule
      expect(filter("# This is a comment")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("nullFilter", () => {
  it("always returns false (ignores nothing)", () => {
    expect(nullFilter("any/path.ts")).toBe(false);
    expect(nullFilter("generated/output.ts")).toBe(false);
    expect(nullFilter("")).toBe(false);
  });
});

describe("makeUriFilter", () => {
  it("returns true when the relative path extracted from URI is ignored", () => {
    const gitignore = (rel: string) => rel.startsWith("generated/");
    const filter = makeUriFilter("file:///project", gitignore);

    expect(filter("file:///project/generated/api.ts")).toBe(true);
  });

  it("returns false when the relative path is not ignored", () => {
    const gitignore = (rel: string) => rel.startsWith("generated/");
    const filter = makeUriFilter("file:///project", gitignore);

    expect(filter("file:///project/src/service.ts")).toBe(false);
  });

  it("returns false for URIs outside the root prefix", () => {
    const gitignore = (rel: string) => rel.startsWith("generated/");
    const filter = makeUriFilter("file:///project", gitignore);

    expect(filter("file:///other/generated/api.ts")).toBe(false);
  });

  it("handles root URI with trailing slash", () => {
    const gitignore = (rel: string) => rel.startsWith("dist/");
    const filter = makeUriFilter("file:///project/", gitignore);

    expect(filter("file:///project/dist/bundle.js")).toBe(true);
    expect(filter("file:///project/src/main.ts")).toBe(false);
  });

  it("does not match when root URI and file URI use different percent-encoding", () => {
    // On Windows, VS Code may produce percent-encoded drive letters (file:///c%3A/...).
    // makeUriFilter uses string startsWith, so both sides must use identical encoding.
    // This test documents that a mismatch silently returns false rather than causing errors.
    // Callers are responsible for ensuring consistent encoding on both sides.
    const gitignore = (rel: string) => rel.startsWith("src/");

    // Matching encoding — works correctly
    const filterEncoded = makeUriFilter("file:///c%3A/proj", gitignore);
    expect(filterEncoded("file:///c%3A/proj/src/main.ts")).toBe(true);

    // Mismatched encoding — returns false (safe, but no filtering occurs)
    expect(filterEncoded("file:///C:/proj/src/main.ts")).toBe(false);
  });
});
