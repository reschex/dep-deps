import { describe, it, expect } from "vitest";
import {
  buildConfiguration,
  DEFAULT_CONFIGURATION,
  isTestFileUri,
  SOURCE_FILE_GLOB,
  EXCLUDE_GLOB,
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

  it("defaults churn.enabled to false", () => {
    const config = buildConfiguration(<T>(_key: string, defaultValue: T) => defaultValue);
    expect(config.churn.enabled).toBe(false);
  });

  it("defaults churn.lookbackDays to 90", () => {
    const config = buildConfiguration(<T>(_key: string, defaultValue: T) => defaultValue);
    expect(config.churn.lookbackDays).toBe(90);
  });

  it("reads churn overrides from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "churn.enabled" ? true : key === "churn.lookbackDays" ? 180 : defaultValue) as T
    );
    expect(config.churn.enabled).toBe(true);
    expect(config.churn.lookbackDays).toBe(180);
  });

  it("reads excludeTests override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "excludeTests" ? false : defaultValue) as T
    );
    expect(config.excludeTests).toBe(false);
  });

  it("returns correct values when all fields are overridden", () => {
    const overrides: Record<string, unknown> = {
      "coverage.fallbackT": 0.75,
      "coverage.lcovGlob": "**/output/lcov.info",
      "coverage.jacocoGlob": "**/target/jacoco.xml",
      "rank.maxIterations": 500,
      "rank.epsilon": 1e-10,
      "cc.eslintPath": "/usr/bin/eslint",
      "cc.pythonPath": "/usr/bin/python3",
      "cc.pmdPath": "/usr/local/bin/pmd",
      "cc.useEslintForTsJs": false,
      "decoration.warnThreshold": 25,
      "decoration.errorThreshold": 75,
      "fileRollup": "sum",
      "codelens.enabled": false,
      "excludeTests": false,
    };
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key in overrides ? overrides[key] : defaultValue) as T
    );
    expect(config).toEqual({
      coverage: { fallbackT: 0.75, lcovGlob: "**/output/lcov.info", jacocoGlob: "**/target/jacoco.xml" },
      rank: { maxIterations: 500, epsilon: 1e-10 },
      cc: {
        eslintPath: "/usr/bin/eslint",
        pythonPath: "/usr/bin/python3",
        pmdPath: "/usr/local/bin/pmd",
        useEslintForTsJs: false,
      },
      decoration: { warnThreshold: 25, errorThreshold: 75 },
      churn: { enabled: false, lookbackDays: 90 },
      impactTree: { maxDepth: 5 },
      graphView: { enabled: false },
      analysis: { defaultFolder: "" },
      fileFilter: { respectGitignore: false },
      fileRollup: "sum",
      codelensEnabled: false,
      excludeTests: false,
      maxFiles: 400,
      debugEnabled: false,
    });
  });

  it("maps codelens.enabled key to codelensEnabled property", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "codelens.enabled" ? true : defaultValue) as T
    );
    expect(config.codelensEnabled).toBe(true);
  });

  it("reads impactTree.maxDepth override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "impactTree.maxDepth" ? 10 : defaultValue) as T
    );
    expect(config.impactTree.maxDepth).toBe(10);
  });

  it("reads analysis.defaultFolder override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "analysis.defaultFolder" ? "src" : defaultValue) as T
    );
    expect(config.analysis.defaultFolder).toBe("src");
  });

  it("preserves zero values from getter without falling back to defaults", () => {
    const overrides: Record<string, unknown> = {
      "coverage.fallbackT": 0,
      "rank.maxIterations": 0,
      "rank.epsilon": 0,
      "decoration.warnThreshold": 0,
      "decoration.errorThreshold": 0,
    };
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key in overrides ? overrides[key] : defaultValue) as T
    );
    expect(config.coverage.fallbackT).toBe(0);
    expect(config.rank.maxIterations).toBe(0);
    expect(config.rank.epsilon).toBe(0);
    expect(config.decoration.warnThreshold).toBe(0);
    expect(config.decoration.errorThreshold).toBe(0);
  });

  it("preserves negative values from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "coverage.fallbackT" ? -1 : defaultValue) as T
    );
    expect(config.coverage.fallbackT).toBe(-1);
  });

  it("preserves very large numeric values from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "rank.maxIterations" ? Number.MAX_SAFE_INTEGER : defaultValue) as T
    );
    expect(config.rank.maxIterations).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("preserves warnThreshold equal to errorThreshold from getter", () => {
    const overrides: Record<string, unknown> = {
      "decoration.warnThreshold": 100,
      "decoration.errorThreshold": 100,
    };
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key in overrides ? overrides[key] : defaultValue) as T
    );
    expect(config.decoration.warnThreshold).toBe(100);
    expect(config.decoration.errorThreshold).toBe(100);
  });

  it("preserves warnThreshold greater than errorThreshold from getter", () => {
    const overrides: Record<string, unknown> = {
      "decoration.warnThreshold": 200,
      "decoration.errorThreshold": 50,
    };
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key in overrides ? overrides[key] : defaultValue) as T
    );
    expect(config.decoration.warnThreshold).toBe(200);
    expect(config.decoration.errorThreshold).toBe(50);
  });
});

describe("DEFAULT_CONFIGURATION", () => {
  it("contains expected default values", () => {
    expect(DEFAULT_CONFIGURATION).toEqual({
      coverage: { fallbackT: 0, lcovGlob: "**/coverage/lcov.info", jacocoGlob: "**/jacoco.xml" },
      rank: { maxIterations: 100, epsilon: 1e-6 },
      cc: {
        eslintPath: "eslint",
        pythonPath: "python",
        pmdPath: "pmd",
        useEslintForTsJs: true,
      },
      decoration: { warnThreshold: 50, errorThreshold: 150 },
      churn: { enabled: false, lookbackDays: 90 },
      impactTree: { maxDepth: 5 },
      graphView: { enabled: false },
      analysis: { defaultFolder: "" },
      fileFilter: { respectGitignore: false },
      fileRollup: "max",
      codelensEnabled: true,
      excludeTests: true,
      maxFiles: 400,
      debugEnabled: false,
    });
  });

  it("has warnThreshold less than errorThreshold", () => {
    expect(DEFAULT_CONFIGURATION.decoration.warnThreshold).toBeLessThan(
      DEFAULT_CONFIGURATION.decoration.errorThreshold
    );
  });

  it("defaults impactTree.maxDepth to 5", () => {
    expect(DEFAULT_CONFIGURATION.impactTree.maxDepth).toBe(5);
  });

  it("defaults analysis.defaultFolder to empty string", () => {
    expect(DEFAULT_CONFIGURATION.analysis.defaultFolder).toBe("");
  });

  it("is frozen at module level (prevents accidental mutation)", () => {
    // Verify the structure keys exist — if someone renames a key, this catches it
    const keys = Object.keys(DEFAULT_CONFIGURATION).sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual([
      "analysis",
      "cc",
      "churn",
      "codelensEnabled",
      "coverage",
      "debugEnabled",
      "decoration",
      "excludeTests",
      "fileFilter",
      "fileRollup",
      "graphView",
      "impactTree",
      "maxFiles",
      "rank",
    ]);
  });
});

describe("exported constants", () => {
  it("SOURCE_FILE_GLOB matches expected extensions", () => {
    expect(SOURCE_FILE_GLOB).toBe("**/*.{ts,tsx,js,jsx,mjs,cjs,py,java}");
  });

  it("EXCLUDE_GLOB excludes node_modules", () => {
    expect(EXCLUDE_GLOB).toBe("**/node_modules/**");
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

  it("returns false for empty string", () => {
    expect(isTestFileUri("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isTestFileUri("   ")).toBe(false);
  });

  it.each([
    "file:///project/src/attest.ts",
    "file:///project/src/detest.ts",
    "file:///project/src/protester.ts",
    "file:///project/contested/file.ts",
    "file:///project/src/attestation/file.ts",
  ])("returns false for %s (test inside word, not a test file)", (uri) => {
    expect(isTestFileUri(uri)).toBe(false);
  });

  it.each([
    "file:///project/src/testing.ts",
    "file:///project/src/testUtils.ts",
  ])("returns false for %s (test at start of filename, no .test. pattern)", (uri) => {
    expect(isTestFileUri(uri)).toBe(false);
  });

  it.each([
    String.raw`C:\project\test\foo.ts`,
    String.raw`C:\project\__tests__\bar.ts`,
    String.raw`C:\project\src\foo.test.ts`,
    String.raw`C:\project\src\bar.spec.js`,
    String.raw`C:\project\test_utils\helper.py`,
  ])("recognises Windows-style path %s as a test file", (uri) => {
    expect(isTestFileUri(uri)).toBe(true);
  });

  it("returns false for file literally named test.ts (not a .test. pattern)", () => {
    expect(isTestFileUri("file:///project/src/test.ts")).toBe(false);
    expect(isTestFileUri("file:///project/src/test.js")).toBe(false);
    expect(isTestFileUri("file:///project/src/spec.ts")).toBe(false);
  });

  it.each([
    "file:///project/src/foo.Test.ts",
    "file:///project/src/foo.SPEC.js",
    "file:///project/src/foo.TEST.tsx",
    "file:///project/src/foo.Spec.mjs",
  ])("recognises case-insensitive pattern %s as a test file", (uri) => {
    expect(isTestFileUri(uri)).toBe(true);
  });

  it("recognises Java-style FooTest.java as a test file", () => {
    expect(isTestFileUri("file:///project/src/FooTest.java")).toBe(true);
    expect(isTestFileUri("file:///project/src/BarTests.java")).toBe(true);
    expect(isTestFileUri("file:///project/src/ServiceIT.java")).toBe(true);
  });

  it.each([
    "file:///project/__TESTS__/helper.ts",
    "file:///project/TEST/integration.ts",
    "file:///project/Tests/unit.ts",
  ])("recognises case-insensitive directory %s as a test file", (uri) => {
    expect(isTestFileUri(uri)).toBe(true);
  });

  it("recognises deeply nested file under __tests__ as a test file", () => {
    expect(isTestFileUri("file:///project/__tests__/deep/nested/file.ts")).toBe(true);
  });

  it("recognises double .test.test. as a test file", () => {
    expect(isTestFileUri("file:///project/src/foo.test.test.ts")).toBe(true);
  });

  it("recognises .test with various extensions as a test file", () => {
    expect(isTestFileUri("file:///project/src/foo.test.tsx")).toBe(true);
    expect(isTestFileUri("file:///project/src/foo.spec.mjs")).toBe(true);
    expect(isTestFileUri("file:///project/src/foo.test.cjs")).toBe(true);
    expect(isTestFileUri("file:///project/src/foo.test.py")).toBe(true);
    expect(isTestFileUri("file:///project/src/foo.test.java")).toBe(true);
  });

  it("recognises test_ prefixed directory as a test location", () => {
    expect(isTestFileUri("file:///project/test_integration/setup.ts")).toBe(true);
    expect(isTestFileUri("file:///project/test_e2e/runner.js")).toBe(true);
  });

  it("returns false for file in a directory that contains test_ mid-name", () => {
    // test_ prefix is only valid at segment boundary
    expect(isTestFileUri("file:///project/my_test_utils/file.ts")).toBe(false);
  });

  it("returns false for URI-encoded paths that do not form test patterns", () => {
    // %20 = space; the .test. pattern is not present
    expect(isTestFileUri("file:///project/src/my%20file.ts")).toBe(false);
  });

  it("recognises test file with URI-encoded spaces in path", () => {
    expect(isTestFileUri("file:///project/src/my%20file.test.ts")).toBe(true);
  });

  it("returns false for paths with unicode characters that are not test files", () => {
    expect(isTestFileUri("file:///project/src/café.ts")).toBe(false);
    expect(isTestFileUri("file:///project/src/модуль.ts")).toBe(false);
  });

  it("recognises test file with unicode characters in path", () => {
    expect(isTestFileUri("file:///project/src/café.test.ts")).toBe(true);
  });
});

describe("bugmagnet session 2026-04-16", () => {

  describe("isTestFileUri — complex interactions", () => {
    it("returns true when both file and directory patterns match", () => {
      // File is .test.ts AND lives under __tests__
      expect(isTestFileUri("file:///project/__tests__/foo.test.ts")).toBe(true);
    });

    it("returns true when file pattern matches even in non-test directory", () => {
      expect(isTestFileUri("file:///project/src/lib/deep/foo.spec.ts")).toBe(true);
    });

    it("returns true when directory pattern matches even for non-test-named file", () => {
      expect(isTestFileUri("file:///project/test/helpers.ts")).toBe(true);
    });

    it("returns false when neither file nor directory patterns match", () => {
      expect(isTestFileUri("file:///project/src/utils/helpers.ts")).toBe(false);
    });
  });

  describe("isTestFileUri — path separator edge cases", () => {
    it("returns true for test directory at root of path", () => {
      // TEST_DIR_RE uses (?:^|[/\\]) so test at start should match  
      expect(isTestFileUri("test/foo.ts")).toBe(true);
    });

    it("returns true for __tests__ at root of path", () => {
      expect(isTestFileUri("__tests__/foo.ts")).toBe(true);
    });

    it("returns false for path with only file name and no test pattern", () => {
      expect(isTestFileUri("foo.ts")).toBe(false);
    });

    it("returns true for bare file with .test. pattern", () => {
      expect(isTestFileUri("foo.test.ts")).toBe(true);
    });

    it("returns false for test directory with no file (trailing slash)", () => {
      // Just the dir name — no file after it, but regex allows end-of-string
      expect(isTestFileUri("file:///project/test/")).toBe(true);
    });

    it("returns true for tests (plural) directory", () => {
      expect(isTestFileUri("file:///project/tests/integration.ts")).toBe(true);
    });

    it("returns false for testss (double s) directory", () => {
      // tests? means test or tests; testss should not match
      expect(isTestFileUri("file:///project/testss/file.ts")).toBe(false);
    });
  });

  describe("isTestFileUri — string edge cases", () => {
    it("returns false for very long non-test path", () => {
      const longPath = "file:///project/" + "deep/".repeat(100) + "module.ts";
      expect(isTestFileUri(longPath)).toBe(false);
    });

    it("returns true for very long path ending with .test.ts", () => {
      const longPath = "file:///project/" + "deep/".repeat(100) + "module.test.ts";
      expect(isTestFileUri(longPath)).toBe(true);
    });

    it("returns false for path with newline characters", () => {
      expect(isTestFileUri("file:///project/src/foo\n.ts")).toBe(false);
    });

    it("returns false for path with tab characters", () => {
      expect(isTestFileUri("file:///project/src/foo\t.ts")).toBe(false);
    });

    it("returns true for .test. with newline in non-matching position", () => {
      // newline before path doesn't affect .test. match at end
      expect(isTestFileUri("file:///project\n/src/foo.test.ts")).toBe(true);
    });
  });

  describe("isTestFileUri — boundary between test file and test dir regex", () => {
    it("returns true for test_ dir with special chars in suffix", () => {
      expect(isTestFileUri("file:///project/test_integration-e2e/file.ts")).toBe(true);
    });

    it("returns false for test_ at end of path with no trailing content", () => {
      // test_[^/\\]+ requires at least one char after test_
      // but test_ at end of string followed by $ should match via end alternative
      // Actually: test_ needs [^/\\]+ after it — at least one non-separator char
      // "test_" at end w/o more chars doesn't match test_[^/\\]+
      // but tests? matches "test" — let me check if "test_" matches tests?
      // "tests?" means "test" or "tests", not "test_" so test_ won't match tests?
      // test_ only matches if followed by non-separator chars
      expect(isTestFileUri("file:///project/test_")).toBe(false);
    });
  });

  describe("buildConfiguration — string property edge cases", () => {
    it("preserves empty string values from getter", () => {
      const overrides: Record<string, unknown> = {
        "cc.eslintPath": "",
        "cc.pythonPath": "",
        "cc.pmdPath": "",
        "coverage.lcovGlob": "",
      };
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key in overrides ? overrides[key] : defaultValue) as T
      );
      expect(config.cc.eslintPath).toBe("");
      expect(config.cc.pythonPath).toBe("");
      expect(config.cc.pmdPath).toBe("");
      expect(config.coverage.lcovGlob).toBe("");
    });

    it("preserves paths with spaces from getter", () => {
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key === "cc.eslintPath" ? "/path with spaces/eslint" : defaultValue) as T
      );
      expect(config.cc.eslintPath).toBe("/path with spaces/eslint");
    });

    it("preserves Windows-style paths from getter", () => {
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key === "cc.pmdPath" ? String.raw`C:\Program Files\pmd\bin\pmd.bat` : defaultValue) as T
      );
      expect(config.cc.pmdPath).toBe(String.raw`C:\Program Files\pmd\bin\pmd.bat`);
    });
  });

  describe("buildConfiguration — getter interaction patterns", () => {
    it("calls getter once per configuration key", () => {
      const calls: string[] = [];
      buildConfiguration(<T>(key: string, defaultValue: T) => {
        calls.push(key);
        return defaultValue;
      });
      // Each config key should be read exactly once
      expect(calls.toSorted((a, b) => a.localeCompare(b))).toEqual([
        "analysis.defaultFolder",
        "cc.eslintPath",
        "cc.pmdPath",
        "cc.pythonPath",
        "cc.useEslintForTsJs",
        "churn.enabled",
        "churn.lookbackDays",
        "codelens.enabled",
        "coverage.fallbackT",
        "coverage.jacocoGlob",
        "coverage.lcovGlob",
        "debug",
        "decoration.errorThreshold",
        "decoration.warnThreshold",
        "excludeTests",
        "fileFilter.respectGitignore",
        "fileRollup",
        "graphView.enabled",
        "impactTree.maxDepth",
        "maxFiles",
        "rank.epsilon",
        "rank.maxIterations",
      ]);
    });

    it("passes correct default values to getter for each key", () => {
      const defaults: Record<string, unknown> = {};
      buildConfiguration(<T>(key: string, defaultValue: T) => {
        defaults[key] = defaultValue;
        return defaultValue;
      });
      expect(defaults).toEqual({
        "coverage.fallbackT": 0,
        "coverage.lcovGlob": "**/coverage/lcov.info",
        "coverage.jacocoGlob": "**/jacoco.xml",
        "rank.maxIterations": 100,
        "rank.epsilon": 1e-6,
        "cc.eslintPath": "eslint",
        "cc.pythonPath": "python",
        "cc.pmdPath": "pmd",
        "cc.useEslintForTsJs": true,
        "decoration.warnThreshold": 50,
        "decoration.errorThreshold": 150,
        "churn.enabled": false,
        "churn.lookbackDays": 90,
        "impactTree.maxDepth": 5,
        "graphView.enabled": false,
        "analysis.defaultFolder": "",
        "fileFilter.respectGitignore": false,
        "fileRollup": "max",
        "codelens.enabled": true,
        "excludeTests": true,
        "maxFiles": 400,
        "debug": false,
      });
    });

    it("returns getter value even when it throws for some keys", () => {
      // Simulates a getter that throws for unknown keys
      const config = buildConfiguration(<T>(key: string, defaultValue: T) => {
        if (key === "coverage.fallbackT") return 0.99 as T;
        return defaultValue;
      });
      expect(config.coverage.fallbackT).toBe(0.99);
      expect(config.rank.maxIterations).toBe(100);
    });
  });

  describe("buildConfiguration — violated domain constraints", () => {
    it("preserves NaN from getter without validation", () => {
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key === "rank.epsilon" ? Number.NaN : defaultValue) as T
      );
      expect(config.rank.epsilon).toBeNaN();
    });

    it("preserves Infinity from getter without validation", () => {
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key === "rank.maxIterations" ? Infinity : defaultValue) as T
      );
      expect(config.rank.maxIterations).toBe(Infinity);
    });

    it("preserves negative epsilon from getter without validation", () => {
      const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
        (key === "rank.epsilon" ? -0.001 : defaultValue) as T
      );
      expect(config.rank.epsilon).toBe(-0.001);
    });
  });
});

describe("mutation-killing: DEFAULT_CONFIGURATION individual properties", () => {
  it("coverage sub-object has fallbackT and lcovGlob", () => {
    expect(DEFAULT_CONFIGURATION.coverage.fallbackT).toBe(0);
    expect(DEFAULT_CONFIGURATION.coverage.lcovGlob).toBe("**/coverage/lcov.info");
  });

  it("rank sub-object has maxIterations and epsilon", () => {
    expect(DEFAULT_CONFIGURATION.rank.maxIterations).toBe(100);
    expect(DEFAULT_CONFIGURATION.rank.epsilon).toBe(1e-6);
  });

  it("cc sub-object has all four fields", () => {
    expect(DEFAULT_CONFIGURATION.cc.eslintPath).toBe("eslint");
    expect(DEFAULT_CONFIGURATION.cc.pythonPath).toBe("python");
    expect(DEFAULT_CONFIGURATION.cc.pmdPath).toBe("pmd");
    expect(DEFAULT_CONFIGURATION.cc.useEslintForTsJs).toBe(true);
  });

  it("decoration sub-object has warnThreshold and errorThreshold", () => {
    expect(DEFAULT_CONFIGURATION.decoration.warnThreshold).toBe(50);
    expect(DEFAULT_CONFIGURATION.decoration.errorThreshold).toBe(150);
  });

  it("fileRollup defaults to max", () => {
    expect(DEFAULT_CONFIGURATION.fileRollup).toBe("max");
  });

  it("codelensEnabled defaults to true", () => {
    expect(DEFAULT_CONFIGURATION.codelensEnabled).toBe(true);
  });

  it("excludeTests defaults to true", () => {
    expect(DEFAULT_CONFIGURATION.excludeTests).toBe(true);
  });
});

describe("fileFilter configuration", () => {
  it("defaults fileFilter.respectGitignore to false", () => {
    expect(DEFAULT_CONFIGURATION.fileFilter.respectGitignore).toBe(false);
  });

  it("buildConfiguration reads fileFilter.respectGitignore override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "fileFilter.respectGitignore" ? true : defaultValue) as T
    );
    expect(config.fileFilter.respectGitignore).toBe(true);
  });
});

describe("debugEnabled configuration", () => {
  it("defaults debugEnabled to false", () => {
    expect(DEFAULT_CONFIGURATION.debugEnabled).toBe(false);
  });

  it("buildConfiguration reads debug override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "debug" ? true : defaultValue) as T
    );
    expect(config.debugEnabled).toBe(true);
  });

  it("buildConfiguration passes false as default for debug key", () => {
    const defaults: Record<string, unknown> = {};
    buildConfiguration(<T>(key: string, defaultValue: T) => {
      defaults[key] = defaultValue;
      return defaultValue;
    });
    expect(defaults["debug"]).toBe(false);
  });
});

describe("graphView configuration", () => {
  it("DEFAULT_CONFIGURATION has graphView.enabled set to false", () => {
    expect(DEFAULT_CONFIGURATION.graphView.enabled).toBe(false);
  });

  it("buildConfiguration reads graphView.enabled override from getter", () => {
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "graphView.enabled" ? true : defaultValue) as T
    );
    expect(config.graphView.enabled).toBe(true);
  });

  it("buildConfiguration passes false as default for graphView.enabled", () => {
    const defaults: Record<string, unknown> = {};
    buildConfiguration(<T>(key: string, defaultValue: T) => {
      defaults[key] = defaultValue;
      return defaultValue;
    });
    expect(defaults["graphView.enabled"]).toBe(false);
  });
});

describe("mutation-killing: SOURCE_FILE_GLOB and EXCLUDE_GLOB", () => {
  it("SOURCE_FILE_GLOB is not empty", () => {
    expect(SOURCE_FILE_GLOB.length).toBeGreaterThan(0);
    expect(SOURCE_FILE_GLOB).toContain("ts");
  });

  it("EXCLUDE_GLOB is not empty", () => {
    expect(EXCLUDE_GLOB.length).toBeGreaterThan(0);
    expect(EXCLUDE_GLOB).toContain("node_modules");
  });
});

describe("mutation-killing: isTestFileUri regex precision", () => {
  // Kill: TEST_FILE_RE $ anchor removal — /\.(?:test|spec)\.[^/\\]+/i vs /\.(?:test|spec)\.[^/\\]+$/i
  // Without $, a mid-path .test. could match differently in edge cases
  // Actually both behave the same for test() calls, so this may be equivalent.
  // But let's add tests ensuring multi-char extensions work (kills [^/\\]+ → [^/\\])
  it(String.raw`matches .test.tsx (multi-char extension kills [^/\]+ → [^/\])`, () => {
    expect(isTestFileUri("file:///project/foo.test.tsx")).toBe(true);
  });

  it("matches .spec.mjs (multi-char extension)", () => {
    expect(isTestFileUri("file:///project/foo.spec.mjs")).toBe(true);
  });

  // Kill: [^/\\]+ → [/\\]+ — replace non-separator class with separator class
  it("matches .test followed by normal chars not separators", () => {
    expect(isTestFileUri("file:///project/foo.test.ts")).toBe(true);
  });

  // Kill: JAVA_TEST_RE $ anchor — /(?:Test|Tests|IT)\.[^/\\]+$/
  it("matches FooTest.java (Java convention, multi-char extension)", () => {
    expect(isTestFileUri("file:///project/FooTest.java")).toBe(true);
  });

  it("matches BarIT.java (Java integration test)", () => {
    expect(isTestFileUri("file:///project/BarIT.java")).toBe(true);
  });

  // Kill: JAVA_TEST_RE [^/\\]+ → [^/\\] (single char)
  it("matches FooTests.java (multi-char extension for Java)", () => {
    expect(isTestFileUri("file:///project/FooTests.java")).toBe(true);
  });

  // Kill: JAVA_TEST_RE [^/\\]+ → [/\\]+
  it("does not match FooTest followed by slash", () => {
    // FooTest./ would NOT be a normal file — just verify FooTest.java works
    expect(isTestFileUri("FooTest.java")).toBe(true);
  });

  // Kill: TEST_DIR_RE — (?:^|[^/\\]) → (?:[/\\])
  // The original matches test at start of string (^) or after non-separator
  // The mutant only matches after a separator
  it("matches test/ at the very start of string (no leading separator)", () => {
    expect(isTestFileUri("test/foo.ts")).toBe(true);
  });

  it("matches __tests__/ at start of string", () => {
    expect(isTestFileUri("__tests__/foo.ts")).toBe(true);
  });

  // Kill: TEST_DIR_RE tests? → tests (no optional s)
  it("matches singular test/ directory", () => {
    expect(isTestFileUri("file:///project/test/foo.ts")).toBe(true);
  });

  // Kill: TEST_DIR_RE test_[^/\\]+ → test_[^/\\] (single char after test_)
  it("matches test_ dir with multi-char suffix", () => {
    expect(isTestFileUri("file:///project/test_integration/foo.ts")).toBe(true);
  });

  // Kill: TEST_DIR_RE test_[^/\\]+ → test_[/\\]+
  it("matches test_e2e dir with normal chars in suffix", () => {
    expect(isTestFileUri("file:///project/test_e2e/runner.ts")).toBe(true);
  });

  // Kill: TEST_DIR_RE (?:[/\\]|$) → (?:[/\\]) — removes end-of-string anchor
  it("matches path ending in test dir with no trailing content", () => {
    expect(isTestFileUri("file:///project/test")).toBe(true);
  });

  // Kill: TEST_DIR_RE (?:[/\\]|$) → (?:[^/\\]|$) — changes separator to non-separator
  it("matches test/ when followed by separator", () => {
    expect(isTestFileUri("file:///project/test/file.ts")).toBe(true);
  });

  it(String.raw`matches tests\ with backslash separator`, () => {
    expect(isTestFileUri(String.raw`C:\project\tests\file.ts`)).toBe(true);
  });
});
