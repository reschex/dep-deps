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
import { matchesExcludePattern, DEFAULT_TEST_EXCLUDE_PATTERNS } from "./excludeFilter";

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

  describe("Scenario: Case-insensitive matching", () => {
    it("matches case-insensitively when nocase is true", () => {
      const patterns = ["**/*.test.*"];
      expect(matchesExcludePattern("file:///project/src/foo.TEST.ts", patterns, { nocase: true })).toBe(true);
    });

    it("does not match case-insensitively by default", () => {
      const patterns = ["**/*.test.*"];
      expect(matchesExcludePattern("file:///project/src/foo.TEST.ts", patterns)).toBe(false);
    });

    it("matches case-insensitive directory names when nocase is true", () => {
      const patterns = ["**/__tests__/**"];
      expect(matchesExcludePattern("file:///project/__TESTS__/foo.ts", patterns, { nocase: true })).toBe(true);
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

describe("DEFAULT_TEST_EXCLUDE_PATTERNS", () => {
  const opts = { nocase: true };

  it("is a non-empty array", () => {
    expect(DEFAULT_TEST_EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
  });

  describe("matches JS/TS test file conventions", () => {
    it.each([
      "file:///project/src/foo.test.ts",
      "file:///project/src/bar.spec.js",
      "file:///project/src/baz.test.py",
      "file:///project/src/foo.test.tsx",
      "file:///project/src/foo.spec.mjs",
      "file:///project/src/foo.test.cjs",
    ])("matches %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(true);
    });
  });

  describe("matches case-insensitive test file patterns", () => {
    it.each([
      "file:///project/src/foo.TEST.ts",
      "file:///project/src/foo.Spec.js",
      "file:///project/src/foo.SPEC.tsx",
    ])("matches %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(true);
    });
  });

  describe("matches Java test conventions", () => {
    it.each([
      "file:///project/src/FooTest.java",
      "file:///project/src/BarTests.java",
      "file:///project/src/ServiceIT.java",
    ])("matches %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(true);
    });
  });

  describe("matches test directory conventions", () => {
    it.each([
      "file:///project/__tests__/helper.ts",
      "file:///project/test/integration.ts",
      "file:///project/tests/unit.ts",
      "file:///project/test_integration/setup.ts",
      "file:///project/test_e2e/runner.js",
      "file:///project/__TESTS__/helper.ts",
      "file:///project/TEST/integration.ts",
      "file:///project/Tests/unit.ts",
    ])("matches %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(true);
    });
  });

  describe("does NOT match production files", () => {
    it.each([
      "file:///project/src/foo.ts",
      "file:///project/src/bar.js",
      "file:///project/src/service.py",
      "file:///project/src/Main.java",
      "file:///project/src/contest.ts",
      "file:///project/src/latest.ts",
      "file:///project/src/attest.ts",
      "file:///project/src/testing.ts",
      "file:///project/src/testUtils.ts",
    ])("does not match %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(false);
    });
  });

  describe("does NOT match files with test-like substrings in non-test contexts", () => {
    it.each([
      "file:///project/src/detest.ts",
      "file:///project/src/protester.ts",
      "file:///project/contested/file.ts",
      "file:///project/src/attestation/file.ts",
    ])("does not match %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(false);
    });
  });

  describe("handles Windows-style file URIs", () => {
    it.each([
      "file:///C%3A/project/test/foo.ts",
      "file:///C%3A/project/__tests__/bar.ts",
      "file:///C%3A/project/src/foo.test.ts",
      "file:///C%3A/project/src/bar.spec.js",
      "file:///C%3A/project/test_utils/helper.py",
    ])("matches %s", (uri) => {
      expect(matchesExcludePattern(uri, DEFAULT_TEST_EXCLUDE_PATTERNS, opts)).toBe(true);
    });
  });
});
