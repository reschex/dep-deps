import * as path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

import * as cp from "child_process";
import { runRadonCc } from "./radonSpawn";

/** Helper: create a fake ChildProcess backed by EventEmitters. */
function fakeProc(): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as any).stdout = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("runRadonCc", () => {
  it("returns parsed map when radon produces valid JSON output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const absPath = path.resolve("/src/foo.py");
    const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

    const json = JSON.stringify({
      [absPath]: [
        { type: "function", lineno: 10, name: "bar", complexity: 4 },
      ],
    });
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.get("10:bar")).toBe(4);
    expect(result.size).toBe(1);
  });

  it("returns empty map and kills process when timeout expires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 3000);

    vi.advanceTimersByTime(3000);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty map when spawn emits error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/invalid/python", "/src/foo.py", "/project", 5000);

    proc.emit("error", new Error("ENOENT"));

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("returns empty map when radon produces no output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

    proc.emit("close", 0);

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("passes correct arguments to cp.spawn", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runRadonCc("/usr/bin/python3", "/src/foo.py", "/workspace", 5000);

    expect(cp.spawn).toHaveBeenCalledWith(
      "/usr/bin/python3",
      ["-m", "radon", "cc", "-j", "/src/foo.py"],
      { cwd: "/workspace", windowsHide: true }
    );

    proc.emit("close", 0);
  });

  it("concatenates multiple stdout data chunks correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const absPath = path.resolve("/src/foo.py");
    const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

    const full = JSON.stringify({
      [absPath]: [
        { type: "function", lineno: 5, name: "hello", complexity: 3 },
      ],
    });
    const mid = Math.floor(full.length / 2);
    proc.stdout!.emit("data", Buffer.from(full.slice(0, mid)));
    proc.stdout!.emit("data", Buffer.from(full.slice(mid)));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.get("5:hello")).toBe(3);
  });

  it("resolves only once when both close and error fire", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const absPath = path.resolve("/src/foo.py");
    const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

    const json = JSON.stringify({
      [absPath]: [
        { type: "function", lineno: 1, name: "fn", complexity: 2 },
      ],
    });
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 0);
    proc.emit("error", new Error("late error"));

    const result = await promise;
    expect(result.get("1:fn")).toBe(2);
  });

  it("resolves only once when timeout fires then close fires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 1000);

    vi.advanceTimersByTime(1000);
    proc.emit("close", null);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("passes filePath through to parser for correct key matching", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const absPath = path.resolve("/src/deep/nested/mod.py");
    const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

    const json = JSON.stringify({
      [absPath]: [
        { type: "function", lineno: 20, name: "deep_fn", complexity: 8 },
      ],
    });
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.get("20:deep_fn")).toBe(8);
  });

  it("returns empty map when timeoutMs is 0", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 0);

    vi.advanceTimersByTime(0);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns parsed map for large output with many function blocks", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const absPath = path.resolve("/src/big.py");
    const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

    const blocks = Array.from({ length: 50 }, (_, i) => ({
      type: "function",
      lineno: i + 1,
      name: `fn_${i}`,
      complexity: i + 2,
    }));
    const json = JSON.stringify({ [absPath]: blocks });
    proc.stdout!.emit("data", Buffer.from(json));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.size).toBe(50);
    expect(result.get("1:fn_0")).toBe(2);
    expect(result.get("50:fn_49")).toBe(51);
  });

  it("passes pythonPath with spaces to spawn correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runRadonCc("C:\\Program Files\\Python\\python.exe", "/src/foo.py", "/project", 5000);

    expect(vi.mocked(cp.spawn).mock.calls[0][0]).toBe("C:\\Program Files\\Python\\python.exe");

    proc.emit("close", 0);
  });

  it("returns empty map when stdout is null", async () => {
    const proc = new EventEmitter() as unknown as ChildProcess;
    (proc as any).stdout = null;
    proc.kill = vi.fn();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

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

      const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

      proc.emit("error", new Error("EACCES"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when error fires after partial stdout data", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from('{"partial": ['));
      proc.emit("error", new Error("EPIPE"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when stdout emits invalid JSON then close fires", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from("not json at all { broken"));
      proc.emit("close", 1);

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("ignores close event after error already resolved the promise", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const absPath = path.resolve("/src/foo.py");
      const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

      proc.emit("error", new Error("ENOENT"));
      // Late data + close after error
      const json = JSON.stringify({
        [absPath]: [{ type: "function", lineno: 1, name: "fn", complexity: 99 }],
      });
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 0);

      const result = await promise;
      // Error resolved first with empty map — close should not override
      expect(result.size).toBe(0);
    });
  });

  describe("timeout edge cases", () => {
    it("returns empty map when timeout is very small (1ms)", async () => {
      vi.useFakeTimers();
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 1);

      vi.advanceTimersByTime(1);

      const result = await promise;
      expect(result.size).toBe(0);
      expect(proc.kill).toHaveBeenCalled();
    });

    it("does not kill process when it completes before timeout", async () => {
      vi.useFakeTimers();
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runRadonCc("/usr/bin/python3", "/src/foo.py", "/project", 5000);

      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
      expect(proc.kill).not.toHaveBeenCalled();

      // Advance past timeout — should not cause issues
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

      const abs1 = path.resolve("/src/a.py");
      const abs2 = path.resolve("/src/b.py");

      const p1 = runRadonCc("/usr/bin/python3", abs1, "/project", 5000);
      const p2 = runRadonCc("/usr/bin/python3", abs2, "/project", 5000);

      proc1.stdout!.emit("data", Buffer.from(JSON.stringify({
        [abs1]: [{ type: "function", lineno: 1, name: "a_fn", complexity: 3 }],
      })));
      proc1.emit("close", 0);

      proc2.stdout!.emit("data", Buffer.from(JSON.stringify({
        [abs2]: [{ type: "function", lineno: 2, name: "b_fn", complexity: 7 }],
      })));
      proc2.emit("close", 0);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.get("1:a_fn")).toBe(3);
      expect(r1.size).toBe(1);
      expect(r2.get("2:b_fn")).toBe(7);
      expect(r2.size).toBe(1);
    });
  });

  describe("string/path edge cases", () => {
    it("passes file path with unicode characters to spawn", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      runRadonCc("/usr/bin/python3", "/src/données/app.py", "/project", 5000);

      expect(vi.mocked(cp.spawn).mock.calls[0][1]).toContain("/src/données/app.py");

      proc.emit("close", 0);
    });

    it("passes empty string pythonPath to spawn without crashing", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runRadonCc("", "/src/foo.py", "/project", 5000);

      proc.emit("error", new Error("ENOENT"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("passes filePath with parent directory references to spawn", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      runRadonCc("/usr/bin/python3", "/src/../src/foo.py", "/project", 5000);

      expect(vi.mocked(cp.spawn).mock.calls[0][1]).toContain("/src/../src/foo.py");

      proc.emit("close", 0);
    });
  });

  describe("complex output scenarios", () => {
    it("returns map with multiple functions from same file", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const absPath = path.resolve("/src/multi.py");
      const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

      const json = JSON.stringify({
        [absPath]: [
          { type: "function", lineno: 1, name: "init", complexity: 1 },
          { type: "function", lineno: 10, name: "process", complexity: 12 },
          { type: "function", lineno: 30, name: "cleanup", complexity: 2 },
        ],
      });
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(3);
      expect(result.get("1:init")).toBe(1);
      expect(result.get("10:process")).toBe(12);
      expect(result.get("30:cleanup")).toBe(2);
    });

    it("returns empty map when radon output has wrong file path key", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const absPath = path.resolve("/src/target.py");
      const promise = runRadonCc("/usr/bin/python3", absPath, "/project", 5000);

      const json = JSON.stringify({
        "/some/other/file.py": [
          { type: "function", lineno: 1, name: "fn", complexity: 5 },
        ],
      });
      proc.stdout!.emit("data", Buffer.from(json));
      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });
});
