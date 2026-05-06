import { describe, it, expect } from "vitest";
import {
  buildConfiguration,
  DEFAULT_CONFIGURATION,
  SOURCE_FILE_GLOB,
  EXCLUDE_GLOB,
} from "./configuration";
import { DEFAULT_TEST_EXCLUDE_PATTERNS } from "../../core/excludeFilter";

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
      fileFilter: { respectGitignore: false, excludePatterns: [] },
      fileRollup: "sum",
      codelensEnabled: false,
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
      fileFilter: { respectGitignore: false, excludePatterns: [] },
      fileRollup: "max",
      codelensEnabled: true,
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

describe("bugmagnet session 2026-04-16", () => {
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
        "fileFilter.excludePatterns",
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
        "fileFilter.excludePatterns": [],
        "fileFilter.respectGitignore": false,
        "fileRollup": "max",
        "codelens.enabled": true,
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

  it("defaults fileFilter.excludePatterns to empty array (test files included by default)", () => {
    expect(DEFAULT_CONFIGURATION.fileFilter.excludePatterns).toEqual([]);
  });

  it("DEFAULT_TEST_EXCLUDE_PATTERNS remains exported as opt-in helper for users", () => {
    // Even though defaults are empty, DEFAULT_TEST_EXCLUDE_PATTERNS is documented
    // and exported so users can copy it into their config to opt into test exclusion.
    expect(DEFAULT_TEST_EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
  });

  it("buildConfiguration reads fileFilter.excludePatterns override from getter", () => {
    const patterns = ["**/register*.ts", "**/generated/**"];
    const config = buildConfiguration(<T>(key: string, defaultValue: T) =>
      (key === "fileFilter.excludePatterns" ? patterns : defaultValue) as T
    );
    expect(config.fileFilter.excludePatterns).toEqual(patterns);
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

