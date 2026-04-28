import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./radonSpawn", () => ({
  runRadonCc: vi.fn(async () => new Map()),
}));

import { radonCcForFile } from "./radonCc";
import { runRadonCc } from "./radonSpawn";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("radonCcForFile", () => {
  it("returns empty map without calling radon when languageId is not python", async () => {
    const result = await radonCcForFile("java", "/src/Foo.java", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("delegates to runRadonCc when languageId is python", async () => {
    const ccMap = new Map([["10:bar", 4]]);
    vi.mocked(runRadonCc).mockResolvedValue(ccMap);

    const result = await radonCcForFile("python", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result).toBe(ccMap);
    expect(runRadonCc).toHaveBeenCalledOnce();
  });

  it("passes pythonPath, fsPath, cwd, and 15000ms timeout to spawn", async () => {
    vi.mocked(runRadonCc).mockResolvedValue(new Map());

    await radonCcForFile("python", "/src/bar.py", "/workspace", "/opt/python/bin/python3");

    expect(runRadonCc).toHaveBeenCalledWith(
      "/opt/python/bin/python3",
      "/src/bar.py",
      "/workspace",
      15000
    );
  });

  it("returns empty map for uppercase Python languageId", async () => {
    const result = await radonCcForFile("Python", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("returns the exact map instance from runRadonCc", async () => {
    const ccMap = new Map([["5:init", 3], ["20:process", 15]]);
    vi.mocked(runRadonCc).mockResolvedValue(ccMap);

    const result = await radonCcForFile("python", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result).toBe(ccMap);
    expect(result.get("5:init")).toBe(3);
    expect(result.get("20:process")).toBe(15);
  });

  it("returns empty map for empty string languageId", async () => {
    const result = await radonCcForFile("", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("returns empty map for whitespace-padded python languageId", async () => {
    const result = await radonCcForFile(" python ", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("returns empty map then delegates on consecutive calls with different languageIds", async () => {
    const ccMap = new Map([["1:fn", 5]]);
    vi.mocked(runRadonCc).mockResolvedValue(ccMap);

    const r1 = await radonCcForFile("javascript", "/src/foo.js", "/project", "/usr/bin/python3");
    const r2 = await radonCcForFile("python", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(r1.size).toBe(0);
    expect(r2).toBe(ccMap);
    expect(runRadonCc).toHaveBeenCalledOnce();
  });
});

describe("radonCcForFile — bugmagnet session 2026-04-16", () => {
  it("returns empty map for PYTHON (all caps) languageId", async () => {
    const result = await radonCcForFile("PYTHON", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("returns empty map for typescript languageId", async () => {
    const result = await radonCcForFile("typescript", "/src/foo.ts", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("returns empty map for javascriptreact languageId", async () => {
    const result = await radonCcForFile("javascriptreact", "/src/foo.jsx", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("forwards path with spaces correctly to runRadonCc", async () => {
    vi.mocked(runRadonCc).mockResolvedValue(new Map());

    await radonCcForFile("python", "/my project/src/foo bar.py", "/my project", "/usr/local/bin/python3");

    expect(runRadonCc).toHaveBeenCalledWith(
      "/usr/local/bin/python3",
      "/my project/src/foo bar.py",
      "/my project",
      15000
    );
  });

  it("forwards Windows-style paths correctly", async () => {
    vi.mocked(runRadonCc).mockResolvedValue(new Map());

    await radonCcForFile("python", "C:\\Users\\dev\\foo.py", "C:\\Users\\dev", "C:\\Python311\\python.exe");

    expect(runRadonCc).toHaveBeenCalledWith(
      "C:\\Python311\\python.exe",
      "C:\\Users\\dev\\foo.py",
      "C:\\Users\\dev",
      15000
    );
  });

  it("propagates rejection from runRadonCc", async () => {
    vi.mocked(runRadonCc).mockRejectedValue(new Error("spawn failed"));

    await expect(radonCcForFile("python", "/src/foo.py", "/project", "/usr/bin/python3")).rejects.toThrow("spawn failed");
  });

  it("returns empty map for pYtHoN (mixed case) languageId", async () => {
    const result = await radonCcForFile("pYtHoN", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });

  it("handles multiple sequential python calls independently", async () => {
    const map1 = new Map([["1:a", 2]]);
    const map2 = new Map([["5:b", 8]]);
    vi.mocked(runRadonCc).mockResolvedValueOnce(map1).mockResolvedValueOnce(map2);

    const r1 = await radonCcForFile("python", "/src/a.py", "/project", "/usr/bin/python3");
    const r2 = await radonCcForFile("python", "/src/b.py", "/project", "/usr/bin/python3");

    expect(r1).toBe(map1);
    expect(r2).toBe(map2);
    expect(runRadonCc).toHaveBeenCalledTimes(2);
  });

  it("returns empty map for python3 languageId", async () => {
    const result = await radonCcForFile("python3", "/src/foo.py", "/project", "/usr/bin/python3");

    expect(result.size).toBe(0);
    expect(runRadonCc).not.toHaveBeenCalled();
  });
});
