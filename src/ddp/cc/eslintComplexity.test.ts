import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./eslintSpawn", () => ({
  runEslintComplexity: vi.fn(async () => new Map()),
}));

const { eslintCcForFile, isJsLanguage } = await import("./eslintComplexity");
const { runEslintComplexity } = await import("./eslintSpawn");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("eslintCcForFile", () => {
  it("isJsLanguage accepts all four JS/TS language IDs and rejects others", () => {
    expect(isJsLanguage("javascript")).toBe(true);
    expect(isJsLanguage("typescript")).toBe(true);
    expect(isJsLanguage("javascriptreact")).toBe(true);
    expect(isJsLanguage("typescriptreact")).toBe(true);
    expect(isJsLanguage("python")).toBe(false);
    expect(isJsLanguage("")).toBe(false);
  });

  it("returns empty map without calling ESLint when languageId is not a JS language", async () => {
    const result = await eslintCcForFile("python", "/src/foo.py", "/project", "/usr/bin/eslint");

    expect(result.size).toBe(0);
    expect(runEslintComplexity).not.toHaveBeenCalled();
  });

  it("delegates to runEslintComplexity when languageId is javascript", async () => {
    const ccMap = new Map([[10, 7]]);
    vi.mocked(runEslintComplexity).mockResolvedValue(ccMap);

    const result = await eslintCcForFile("javascript", "/src/foo.js", "/project", "/usr/bin/eslint");

    expect(result).toBe(ccMap);
    expect(runEslintComplexity).toHaveBeenCalledOnce();
  });

  it("delegates to runEslintComplexity when languageId is typescript", async () => {
    const ccMap = new Map([[5, 3]]);
    vi.mocked(runEslintComplexity).mockResolvedValue(ccMap);

    const result = await eslintCcForFile("typescript", "/src/foo.ts", "/project", "/usr/bin/eslint");

    expect(result).toBe(ccMap);
  });

  it("delegates to runEslintComplexity when languageId is javascriptreact", async () => {
    vi.mocked(runEslintComplexity).mockResolvedValue(new Map([[1, 2]]));

    const result = await eslintCcForFile("javascriptreact", "/src/App.jsx", "/project", "/usr/bin/eslint");

    expect(result.get(1)).toBe(2);
    expect(runEslintComplexity).toHaveBeenCalledOnce();
  });

  it("delegates to runEslintComplexity when languageId is typescriptreact", async () => {
    vi.mocked(runEslintComplexity).mockResolvedValue(new Map([[3, 8]]));

    const result = await eslintCcForFile("typescriptreact", "/src/App.tsx", "/project", "/usr/bin/eslint");

    expect(result.get(3)).toBe(8);
    expect(runEslintComplexity).toHaveBeenCalledOnce();
  });

  it("delegates for all four JS language IDs and rejects others", async () => {
    vi.mocked(runEslintComplexity).mockResolvedValue(new Map([[1, 1]]));
    const langs = ["javascript", "typescript", "javascriptreact", "typescriptreact"];

    for (const lang of langs) {
      vi.mocked(runEslintComplexity).mockClear();
      const result = await eslintCcForFile(lang, "/src/f.ts", "/p", "/e");
      expect(runEslintComplexity).toHaveBeenCalledOnce();
      expect(result.size).toBeGreaterThan(0);
    }

    vi.mocked(runEslintComplexity).mockClear();
    const bad = await eslintCcForFile("", "/src/f.ts", "/p", "/e");
    expect(runEslintComplexity).not.toHaveBeenCalled();
    expect(bad.size).toBe(0);
  });

  it("passes eslintPath, fsPath, cwd, and 20000ms timeout to spawn", async () => {
    vi.mocked(runEslintComplexity).mockResolvedValue(new Map());

    await eslintCcForFile("typescript", "/src/Bar.ts", "/workspace", "/opt/eslint/bin/eslint");

    expect(runEslintComplexity).toHaveBeenCalledWith(
      "/opt/eslint/bin/eslint",
      "/src/Bar.ts",
      "/workspace",
      20000
    );
  });

  it("returns empty map for uppercase JavaScript languageId", async () => {
    const result = await eslintCcForFile("JavaScript", "/src/foo.js", "/project", "/usr/bin/eslint");

    expect(result.size).toBe(0);
    expect(runEslintComplexity).not.toHaveBeenCalled();
  });

  it("returns the exact map instance from runEslintComplexity", async () => {
    const ccMap = new Map([[5, 3], [20, 15]]);
    vi.mocked(runEslintComplexity).mockResolvedValue(ccMap);

    const result = await eslintCcForFile("javascript", "/src/foo.js", "/project", "/usr/bin/eslint");

    expect(result).toBe(ccMap);
    expect(result.get(5)).toBe(3);
    expect(result.get(20)).toBe(15);
  });

  it("returns empty map for empty string languageId", async () => {
    const result = await eslintCcForFile("", "/src/foo.js", "/project", "/usr/bin/eslint");

    expect(result.size).toBe(0);
    expect(runEslintComplexity).not.toHaveBeenCalled();
  });
});

describe("bugmagnet session 2026-04-16", () => {
  describe("languageId edge cases", () => {
    it("returns empty map for java languageId", async () => {
      const result = await eslintCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/eslint");

      expect(result.size).toBe(0);
      expect(runEslintComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for TypeScript (uppercase T) languageId", async () => {
      const result = await eslintCcForFile("TypeScript", "/src/foo.ts", "/project", "/usr/bin/eslint");

      expect(result.size).toBe(0);
      expect(runEslintComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for whitespace-padded typescript languageId", async () => {
      const result = await eslintCcForFile(" typescript ", "/src/foo.ts", "/project", "/usr/bin/eslint");

      expect(result.size).toBe(0);
      expect(runEslintComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for jsx languageId (not javascriptreact)", async () => {
      const result = await eslintCcForFile("jsx", "/src/App.jsx", "/project", "/usr/bin/eslint");

      expect(result.size).toBe(0);
      expect(runEslintComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for tsx languageId (not typescriptreact)", async () => {
      const result = await eslintCcForFile("tsx", "/src/App.tsx", "/project", "/usr/bin/eslint");

      expect(result.size).toBe(0);
      expect(runEslintComplexity).not.toHaveBeenCalled();
    });
  });

  describe("sequential calls", () => {
    it("returns empty map then delegates on consecutive calls with different languageIds", async () => {
      const ccMap = new Map([[1, 5]]);
      vi.mocked(runEslintComplexity).mockResolvedValue(ccMap);

      const r1 = await eslintCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/eslint");
      const r2 = await eslintCcForFile("javascript", "/src/foo.js", "/project", "/usr/bin/eslint");

      expect(r1.size).toBe(0);
      expect(r2).toBe(ccMap);
      expect(runEslintComplexity).toHaveBeenCalledOnce();
    });

    it("delegates independently on two consecutive typescript calls", async () => {
      const map1 = new Map([[1, 2]]);
      const map2 = new Map([[3, 4]]);
      vi.mocked(runEslintComplexity)
        .mockResolvedValueOnce(map1)
        .mockResolvedValueOnce(map2);

      const r1 = await eslintCcForFile("typescript", "/src/a.ts", "/project", "/usr/bin/eslint");
      const r2 = await eslintCcForFile("typescript", "/src/b.ts", "/project", "/usr/bin/eslint");

      expect(r1).toBe(map1);
      expect(r2).toBe(map2);
      expect(runEslintComplexity).toHaveBeenCalledTimes(2);
    });
  });

  describe("argument edge cases", () => {
    it("forwards empty eslintPath to spawn", async () => {
      vi.mocked(runEslintComplexity).mockResolvedValue(new Map());

      await eslintCcForFile("javascript", "/src/foo.js", "/project", "");

      expect(runEslintComplexity).toHaveBeenCalledWith(
        "",
        "/src/foo.js",
        "/project",
        20000
      );
    });

    it("forwards path with spaces and unicode to spawn", async () => {
      vi.mocked(runEslintComplexity).mockResolvedValue(new Map());

      await eslintCcForFile("typescriptreact", "/src/données/App.tsx", "/my project", "C:\\Program Files\\eslint");

      expect(runEslintComplexity).toHaveBeenCalledWith(
        "C:\\Program Files\\eslint",
        "/src/données/App.tsx",
        "/my project",
        20000
      );
    });
  });
});
