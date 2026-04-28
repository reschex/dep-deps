import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

import * as cp from "child_process";
import { runEslintComplexity } from "./eslintSpawn";
import { fakeProc } from "../../../shared/fakeProc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("runEslintComplexity", () => {
  it("returns parsed map when ESLint produces valid JSON output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    const json = JSON.stringify([
      {
        filePath: "/src/foo.ts",
        messages: [{ ruleId: "complexity", line: 10, message: "Function 'bar' has a complexity of 7." }],
      },
    ]);
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 1);

    const result = await promise;
    expect(result.get(10)).toBe(7);
    expect(result.size).toBe(1);
  });

  it("returns empty map and kills process when timeout expires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 3000);

    vi.advanceTimersByTime(3000);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty map when spawn emits error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/invalid/eslint", "/src/foo.ts", "/project", 5000);

    proc.emit("error", new Error("ENOENT"));

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("returns empty map when ESLint produces no output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    proc.emit("close", 0);

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("passes correct arguments to cp.spawn", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runEslintComplexity("/opt/eslint/bin/eslint", "/src/Bar.ts", "/workspace", 5000);

    expect(cp.spawn).toHaveBeenCalledWith(
      "/opt/eslint/bin/eslint",
      ["/src/Bar.ts", "-f", "json", "--no-error-on-unmatched-pattern", "--no-warn-ignored"],
      { cwd: "/workspace", windowsHide: true }
    );

    proc.emit("close", 0);
  });

  it("concatenates multiple stdout data chunks correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    const full = JSON.stringify([
      {
        filePath: "/src/foo.ts",
        messages: [{ ruleId: "complexity", line: 5, message: "has a complexity of 11." }],
      },
    ]);
    const mid = Math.floor(full.length / 2);
    proc.stdout!.emit("data", Buffer.from(full.slice(0, mid)));
    proc.stdout!.emit("data", Buffer.from(full.slice(mid)));
    proc.emit("close", 1);

    const result = await promise;
    expect(result.get(5)).toBe(11);
  });

  it("resolves only once when both close and error fire", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    const json = JSON.stringify([
      {
        filePath: "/src/foo.ts",
        messages: [{ ruleId: "complexity", line: 3, message: "has a complexity of 4." }],
      },
    ]);
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 1);
    proc.emit("error", new Error("late error"));

    const result = await promise;
    expect(result.get(3)).toBe(4);
  });

  it("resolves only once when timeout fires then close fires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 1000);

    vi.advanceTimersByTime(1000);
    proc.emit("close", null);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty map when timeoutMs is 0", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 0);

    vi.advanceTimersByTime(0);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns parsed map for large stdout with many complexity messages", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    const messages = Array.from({ length: 50 }, (_, i) => ({
      ruleId: "complexity",
      line: i + 1,
      message: `Function 'fn${i}' has a complexity of ${i + 2}.`,
    }));
    const json = JSON.stringify([{ filePath: "/src/foo.ts", messages }]);
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 1);

    const result = await promise;
    expect(result.size).toBe(50);
    expect(result.get(1)).toBe(2);
    expect(result.get(50)).toBe(51);
  });

  it("passes eslintPath with spaces to spawn correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runEslintComplexity("C:\\Program Files\\node_modules\\.bin\\eslint", "/src/foo.ts", "/project", 5000);

    expect(vi.mocked(cp.spawn).mock.calls[0][0]).toBe("C:\\Program Files\\node_modules\\.bin\\eslint");

    proc.emit("close", 0);
  });

  it("returns empty map when stdout is null", async () => {
    const proc = new EventEmitter() as unknown as ChildProcess;
    (proc as any).stdout = null;
    proc.kill = vi.fn();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

    proc.emit("close", 0);

    const result = await promise;
    expect(result.size).toBe(0);
  });
});

describe("bugmagnet session 2026-04-16", () => {
  describe("error handling edge cases", () => {
    it("returns empty map when error fires before any stdout data", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.emit("error", new Error("EACCES"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when error fires after partial stdout data", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from('[{"filePath":'));
      proc.emit("error", new Error("EPIPE"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when stdout emits invalid JSON then close fires", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from("<<<not valid json>>>"));
      proc.emit("close", 1);

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("ignores close event after error already resolved the promise", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.emit("error", new Error("ENOENT"));
      // Late data + close after error
      const json = JSON.stringify([{
        filePath: "/src/foo.ts",
        messages: [{ ruleId: "complexity", line: 1, message: "has a complexity of 99." }],
      }]);
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });

  describe("timeout edge cases", () => {
    it("returns empty map when timeout is very small (1ms)", async () => {
      vi.useFakeTimers();
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 1);

      vi.advanceTimersByTime(1);

      const result = await promise;
      expect(result.size).toBe(0);
      expect(proc.kill).toHaveBeenCalled();
    });

    it("does not kill process when it completes before timeout", async () => {
      vi.useFakeTimers();
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
      expect(proc.kill).not.toHaveBeenCalled();

      vi.advanceTimersByTime(6000);
    });
  });

  describe("stateful operations", () => {
    it("handles rapid sequential calls independently", async () => {
      const proc1 = fakeProc();
      const proc2 = fakeProc();
      vi.mocked(cp.spawn)
        .mockReturnValueOnce(proc1)
        .mockReturnValueOnce(proc2);

      const p1 = runEslintComplexity("/usr/bin/eslint", "/src/a.ts", "/project", 5000);
      const p2 = runEslintComplexity("/usr/bin/eslint", "/src/b.ts", "/project", 5000);

      const json1 = JSON.stringify([{
        filePath: "/src/a.ts",
        messages: [{ ruleId: "complexity", line: 1, message: "has a complexity of 3." }],
      }]);
      const json2 = JSON.stringify([{
        filePath: "/src/b.ts",
        messages: [{ ruleId: "complexity", line: 2, message: "has a complexity of 8." }],
      }]);

      proc1.stdout!.emit("data", Buffer.from(json1));
      proc1.emit("close", 1);

      proc2.stdout!.emit("data", Buffer.from(json2));
      proc2.emit("close", 1);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.get(1)).toBe(3);
      expect(r1.size).toBe(1);
      expect(r2.get(2)).toBe(8);
      expect(r2.size).toBe(1);
    });
  });

  describe("string/path edge cases", () => {
    it("passes file path with unicode characters to spawn", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      runEslintComplexity("/usr/bin/eslint", "/src/données/app.ts", "/project", 5000);

      expect(vi.mocked(cp.spawn).mock.calls[0][1]![0]).toBe("/src/données/app.ts");

      proc.emit("close", 0);
    });

    it("passes empty string eslintPath to spawn without crashing", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("", "/src/foo.ts", "/project", 5000);

      proc.emit("error", new Error("ENOENT"));

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });

  describe("complex output scenarios", () => {
    it("returns map with multiple messages from same file", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      const json = JSON.stringify([{
        filePath: "/src/foo.ts",
        messages: [
          { ruleId: "complexity", line: 1, message: "has a complexity of 3." },
          { ruleId: "complexity", line: 20, message: "has a complexity of 15." },
          { ruleId: "complexity", line: 50, message: "has a complexity of 2." },
        ],
      }]);
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 1);

      const result = await promise;
      expect(result.size).toBe(3);
      expect(result.get(1)).toBe(3);
      expect(result.get(20)).toBe(15);
      expect(result.get(50)).toBe(2);
    });

    it("returns empty map when ESLint output is an empty array", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from("[]"));
      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when ESLint output has no complexity messages", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runEslintComplexity("/usr/bin/eslint", "/src/foo.ts", "/project", 5000);

      const json = JSON.stringify([{
        filePath: "/src/foo.ts",
        messages: [
          { ruleId: "no-unused-vars", line: 1, message: "'x' is defined but never used." },
        ],
      }]);
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 1);

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });
});
