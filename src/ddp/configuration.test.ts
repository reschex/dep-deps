import { describe, it, expect } from "vitest";
import {
  buildConfiguration,
  DEFAULT_CONFIGURATION,
  buildExcludeGlob,
  EXCLUDE_GLOB,
  TEST_FILE_EXCLUDE_GLOBS,
  TEST_DIR_EXCLUDE_GLOBS,
  isTestFileUri,
} from "./configuration";

describe("buildConfiguration", () => {
  it("returns defaults when getter returns defaults", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) => defaultValue);
    expect(config).toEqual(DEFAULT_CONFIGURATION);
  });

  it("reads overridden values from getter", () => {
    const overrides: Record<string, unknown> = {
      "coverage.fallbackT": 0.5,
      "rank.maxIterations": 200,
      "fileRollup": "sum",
      "codelens.enabled": false,
    };
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key in overrides ? overrides[key] : defaultValue) as T
    );
    expect(config.coverage.fallbackT).toBe(0.5);
    expect(config.rank.maxIterations).toBe(200);
    expect(config.fileRollup).toBe("sum");
    expect(config.codelensEnabled).toBe(false);
    // Non-overridden values stay at defaults
    expect(config.coverage.lcovGlob).toBe("**/coverage/lcov.info");
    expect(config.cc.eslintPath).toBe("eslint");
  });

  it("defaults excludeTests to true", () => {
    const config = buildConfiguration(<T>(_key: string, defaultValue: T) => defaultValue);
    expect(config.excludeTests).toBe(true);
  });

  it("reads excludeTests override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "excludeTests" ? false : defaultValue) as T
    );
    expect(config.excludeTests).toBe(false);
  });
});

describe("buildExcludeGlob", () => {
  it("returns only node_modules when excludeTests is false", () => {
    expect(buildExcludeGlob(false)).toBe(EXCLUDE_GLOB);
  });

  it("includes test file and test directory patterns when excludeTests is true", () => {
    const glob = buildExcludeGlob(true);
    expect(glob).toContain(EXCLUDE_GLOB);
    for (const pattern of TEST_FILE_EXCLUDE_GLOBS) {
      expect(glob).toContain(pattern);
    }
    for (const dir of TEST_DIR_EXCLUDE_GLOBS) {
      expect(glob).toContain(dir);
    }
  });

  it("wraps combined patterns in a brace group", () => {
    const glob = buildExcludeGlob(true);
    expect(glob.startsWith("{")).toBe(true);
    expect(glob.endsWith("}")).toBe(true);
  });

  it("produces no nested braces (VS Code findFiles limitation)", () => {
    const glob = buildExcludeGlob(true);
    // Strip outer { }
    const inner = glob.slice(1, -1);
    expect(inner).not.toMatch(/\{/);
    expect(inner).not.toMatch(/\}/);
  });
});

describe("isTestFileUri", () => {
  it.each([
    "file:///project/src/foo.test.ts",
    "file:///project/src/bar.spec.js",
    "file:///project/src/baz.test.py",
    "file:///project/src/__tests__/helper.ts",
    "file:///project/test/integration.ts",
    "file:///project/tests/unit.ts",
    "/project/src/foo.spec.java",
    "/project/test_utils/helper.py",
  ])("recognises %s as a test file", (uri) => {
    expect(isTestFileUri(uri)).toBe(true);
  });

  it.each([
    "file:///project/src/foo.ts",
    "file:///project/src/bar.js",
    "file:///project/src/service.py",
    "file:///project/src/Main.java",
    "file:///project/src/contest.ts",
    "file:///project/src/latest.ts",
  ])("does not flag %s as a test file", (uri) => {
    expect(isTestFileUri(uri)).toBe(false);
  });
});
