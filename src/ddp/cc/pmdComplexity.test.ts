import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./pmdSpawn", () => ({
  runPmdCyclomaticComplexity: vi.fn(async () => new Map()),
}));

import { pmdCcForFile } from "./pmdComplexity";
import { runPmdCyclomaticComplexity } from "./pmdSpawn";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pmdCcForFile", () => {
  it("returns empty map without calling PMD when languageId is not java", async () => {
    const result = await pmdCcForFile("python", "/src/foo.py", "/project", "/usr/bin/pmd");

    expect(result.size).toBe(0);
    expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
  });

  it("delegates to runPmdCyclomaticComplexity when languageId is java", async () => {
    const ccMap = new Map([[10, 7]]);
    vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(ccMap);

    const result = await pmdCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/pmd");

    expect(result).toBe(ccMap);
    expect(runPmdCyclomaticComplexity).toHaveBeenCalledOnce();
  });

  it("passes pmdPath, fsPath, cwd, and 30000ms timeout to spawn", async () => {
    vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(new Map());

    await pmdCcForFile("java", "/src/Bar.java", "/workspace", "/opt/pmd/bin/pmd");

    expect(runPmdCyclomaticComplexity).toHaveBeenCalledWith(
      "/opt/pmd/bin/pmd",
      "/src/Bar.java",
      "/workspace",
      30000
    );
  });

  it("returns empty map for typescript languageId", async () => {
    const result = await pmdCcForFile("typescript", "/src/foo.ts", "/project", "/usr/bin/pmd");

    expect(result.size).toBe(0);
    expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
  });

  it("returns empty map for empty string languageId", async () => {
    const result = await pmdCcForFile("", "/src/foo.java", "/project", "/usr/bin/pmd");

    expect(result.size).toBe(0);
    expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
  });

  it("returns empty map for uppercase Java languageId", async () => {
    const result = await pmdCcForFile("Java", "/src/Foo.java", "/project", "/usr/bin/pmd");

    expect(result.size).toBe(0);
    expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
  });

  it("returns the exact map instance from runPmdCyclomaticComplexity", async () => {
    const ccMap = new Map([[5, 3], [20, 15]]);
    vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(ccMap);

    const result = await pmdCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/pmd");

    expect(result).toBe(ccMap);
    expect(result.get(5)).toBe(3);
    expect(result.get(20)).toBe(15);
  });
});

describe("bugmagnet session 2026-04-16", () => {
  describe("languageId edge cases", () => {
    it("returns empty map for javascript languageId", async () => {
      const result = await pmdCcForFile("javascript", "/src/foo.js", "/project", "/usr/bin/pmd");

      expect(result.size).toBe(0);
      expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for JAVA (all caps) languageId", async () => {
      const result = await pmdCcForFile("JAVA", "/src/Foo.java", "/project", "/usr/bin/pmd");

      expect(result.size).toBe(0);
      expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for whitespace-only languageId", async () => {
      const result = await pmdCcForFile("  ", "/src/Foo.java", "/project", "/usr/bin/pmd");

      expect(result.size).toBe(0);
      expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
    });

    it("returns empty map for languageId with leading/trailing spaces around java", async () => {
      const result = await pmdCcForFile(" java ", "/src/Foo.java", "/project", "/usr/bin/pmd");

      expect(result.size).toBe(0);
      expect(runPmdCyclomaticComplexity).not.toHaveBeenCalled();
    });
  });

  describe("sequential calls", () => {
    it("returns empty map then delegates on consecutive calls with different languageIds", async () => {
      const ccMap = new Map([[1, 5]]);
      vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(ccMap);

      const r1 = await pmdCcForFile("python", "/src/foo.py", "/project", "/usr/bin/pmd");
      const r2 = await pmdCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/pmd");

      expect(r1.size).toBe(0);
      expect(r2).toBe(ccMap);
      expect(runPmdCyclomaticComplexity).toHaveBeenCalledOnce();
    });

    it("delegates twice on two consecutive java calls", async () => {
      const map1 = new Map([[1, 2]]);
      const map2 = new Map([[3, 4]]);
      vi.mocked(runPmdCyclomaticComplexity)
        .mockResolvedValueOnce(map1)
        .mockResolvedValueOnce(map2);

      const r1 = await pmdCcForFile("java", "/src/A.java", "/project", "/usr/bin/pmd");
      const r2 = await pmdCcForFile("java", "/src/B.java", "/project", "/usr/bin/pmd");

      expect(r1).toBe(map1);
      expect(r2).toBe(map2);
      expect(runPmdCyclomaticComplexity).toHaveBeenCalledTimes(2);
    });
  });

  describe("argument edge cases", () => {
    it("forwards empty pmdPath to spawn", async () => {
      vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(new Map());

      await pmdCcForFile("java", "/src/Foo.java", "/project", "");

      expect(runPmdCyclomaticComplexity).toHaveBeenCalledWith(
        "",
        "/src/Foo.java",
        "/project",
        30000
      );
    });

    it("forwards path with spaces and unicode to spawn", async () => {
      vi.mocked(runPmdCyclomaticComplexity).mockResolvedValue(new Map());

      await pmdCcForFile("java", "/src/日本語/Foo.java", "/my project", String.raw`C:\Program Files\pmd\pmd.bat`);

      expect(runPmdCyclomaticComplexity).toHaveBeenCalledWith(
        String.raw`C:\Program Files\pmd\pmd.bat`,
        "/src/日本語/Foo.java",
        "/my project",
        30000
      );
    });
  });
});
