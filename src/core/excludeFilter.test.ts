/**
 * Tests for user-defined exclude pattern filtering.
 *
 * Scenario: Exclude files matching user-defined glob patterns
 * Scenario: Exclude entire folders via glob pattern
 * Scenario: Multiple exclude patterns combine additively
 * Scenario: Empty exclude patterns list excludes nothing
 * From: features/file-discovery.feature
 */

import { describe, it, expect } from "vitest";
import { matchesExcludePattern } from "./excludeFilter";

describe("matchesExcludePattern", () => {
  describe("Scenario: Single file glob pattern", () => {
    it("matches a URI containing a file matching the glob", () => {
      const patterns = ["**/register*.ts"];
      expect(matchesExcludePattern("file:///project/src/registerTS.ts", patterns)).toBe(true);
    });

    it("does not match a URI that does not match the glob", () => {
      const patterns = ["**/register*.ts"];
      expect(matchesExcludePattern("file:///project/src/utils.ts", patterns)).toBe(false);
    });
  });

  describe("Scenario: Folder glob pattern", () => {
    it("matches a URI inside an excluded folder", () => {
      const patterns = ["**/generated/**"];
      expect(matchesExcludePattern("file:///project/generated/api.ts", patterns)).toBe(true);
    });

    it("does not match a URI outside the excluded folder", () => {
      const patterns = ["**/generated/**"];
      expect(matchesExcludePattern("file:///project/src/main.ts", patterns)).toBe(false);
    });
  });

  describe("Scenario: Multiple patterns combine additively", () => {
    it("matches when first pattern matches", () => {
      const patterns = ["**/register*.ts", "**/legacy/**"];
      expect(matchesExcludePattern("file:///project/src/registerTS.ts", patterns)).toBe(true);
    });

    it("matches when second pattern matches", () => {
      const patterns = ["**/register*.ts", "**/legacy/**"];
      expect(matchesExcludePattern("file:///project/legacy/old.ts", patterns)).toBe(true);
    });

    it("does not match when no pattern matches", () => {
      const patterns = ["**/register*.ts", "**/legacy/**"];
      expect(matchesExcludePattern("file:///project/src/utils.ts", patterns)).toBe(false);
    });
  });

  describe("Scenario: Empty patterns list excludes nothing", () => {
    it("returns false for any URI when patterns list is empty", () => {
      expect(matchesExcludePattern("file:///project/src/anything.ts", [])).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("handles Windows-style file URIs", () => {
      const patterns = ["**/register*.ts"];
      expect(matchesExcludePattern("file:///C%3A/code/project/src/registerTS.ts", patterns)).toBe(true);
    });

    it("matches deeply nested files", () => {
      const patterns = ["**/generated/**"];
      expect(matchesExcludePattern("file:///project/src/generated/deep/nested/file.ts", patterns)).toBe(true);
    });

    it("pattern without ** matches basename only", () => {
      const patterns = ["register*.ts"];
      // Should still match — minimatch with matchBase-like behavior via path extraction
      expect(matchesExcludePattern("file:///project/src/registerTS.ts", patterns)).toBe(true);
    });

    it("does not throw on malformed percent-encoding", () => {
      // Bare "%" with no following hex digits → decodeURIComponent throws URIError.
      // Filter must be defensive: fall back to raw path, never crash analysis.
      const patterns = ["**/register*.ts"];
      expect(() =>
        matchesExcludePattern("file:///project/src/bad%path/registerTS.ts", patterns)
      ).not.toThrow();
    });

    it("still matches against raw path when percent-decoding fails", () => {
      // After fallback, raw path (with literal "%") is matched against the glob.
      const patterns = ["**/register*.ts"];
      expect(
        matchesExcludePattern("file:///project/src/bad%path/registerTS.ts", patterns)
      ).toBe(true);
    });
  });
});
