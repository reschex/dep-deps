import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// Stub child_process.spawn before importing the module under test.
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import * as cp from "node:child_process";
import { runPmdCyclomaticComplexity } from "./pmdSpawn";

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

describe("runPmdCyclomaticComplexity", () => {
  it("returns parsed map when PMD produces valid XML output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

    const xml = `<pmd>
  <file name="/src/Foo.java">
    <violation beginline="10" rule="CyclomaticComplexity" priority="3">
      The method 'bar' has a cyclomatic complexity of 7.
    </violation>
  </file>
</pmd>`;
    proc.stdout!.emit("data", Buffer.from(xml));
    proc.emit("close", 4);

    const result = await promise;
    expect(result.get(10)).toBe(7);
    expect(result.size).toBe(1);
  });

  it("returns empty map and kills process when timeout expires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 3000);

    vi.advanceTimersByTime(3000);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty map when spawn emits error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/invalid/pmd", "/src/Foo.java", "/project", 5000);

    proc.emit("error", new Error("ENOENT"));

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("returns empty map when PMD produces no output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

    proc.emit("close", 0);

    const result = await promise;
    expect(result.size).toBe(0);
  });

  it("passes correct arguments to cp.spawn", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runPmdCyclomaticComplexity("/opt/pmd/bin/pmd", "/src/Bar.java", "/workspace", 5000);

    expect(cp.spawn).toHaveBeenCalledWith(
      "/opt/pmd/bin/pmd",
      ["check", "-d", "/src/Bar.java", "-R", "category/java/design.xml", "-f", "xml", "--no-cache"],
      { cwd: "/workspace", windowsHide: true }
    );

    proc.emit("close", 0);
  });

  it("concatenates multiple stdout data chunks correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

    const part1 = `<pmd><file name="Foo.java"><violation beginline="5" rule="CyclomaticComplexity" priority="3">`;
    const part2 = `The method 'x' has a cyclomatic complexity of 11.</violation></file></pmd>`;
    proc.stdout!.emit("data", Buffer.from(part1));
    proc.stdout!.emit("data", Buffer.from(part2));
    proc.emit("close", 4);

    const result = await promise;
    expect(result.get(5)).toBe(11);
  });

  it("resolves only once when both close and error fire", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

    const xml = `<pmd><file name="Foo.java">
      <violation beginline="3" rule="CyclomaticComplexity" priority="3">
        The method 'a' has a cyclomatic complexity of 4.
      </violation></file></pmd>`;
    proc.stdout!.emit("data", Buffer.from(xml));
    proc.emit("close", 4);
    proc.emit("error", new Error("late error"));

    const result = await promise;
    expect(result.get(3)).toBe(4);
  });

  it("resolves only once when timeout fires then close fires", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 1000);

    vi.advanceTimersByTime(1000);
    // close fires after kill
    proc.emit("close", null);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty map when timeoutMs is 0", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 0);

    vi.advanceTimersByTime(0);

    const result = await promise;
    expect(result.size).toBe(0);
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns parsed map for large stdout output", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

    const violations = Array.from({ length: 50 }, (_, i) =>
      `<violation beginline="${i + 1}" rule="CyclomaticComplexity" priority="3">
        The method 'm${i}' has a cyclomatic complexity of ${i + 2}.
      </violation>`
    ).join("\n");
    const xml = `<pmd><file name="Foo.java">${violations}</file></pmd>`;
    proc.stdout!.emit("data", Buffer.from(xml));
    proc.emit("close", 4);

    const result = await promise;
    expect(result.size).toBe(50);
    expect(result.get(1)).toBe(2);
    expect(result.get(50)).toBe(51);
  });

  it("passes pmdPath with spaces to spawn correctly", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    runPmdCyclomaticComplexity(String.raw`C:\Program Files\pmd\bin\pmd.bat`, "/src/Foo.java", "/project", 5000);

    expect(vi.mocked(cp.spawn).mock.calls[0][0]).toBe(String.raw`C:\Program Files\pmd\bin\pmd.bat`);

    proc.emit("close", 0);
  });
});

describe("bugmagnet session 2026-04-16", () => {
  describe("error handling edge cases", () => {
    it("returns empty map when error fires before any stdout data", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

      proc.emit("error", new Error("EACCES"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when error fires after partial stdout data", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from("<pmd><file"));
      proc.emit("error", new Error("EPIPE"));

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("returns empty map when stdout emits malformed XML then close fires", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

      proc.stdout!.emit("data", Buffer.from("<<<not valid xml at all>>>"));
      proc.emit("close", 1);

      const result = await promise;
      expect(result.size).toBe(0);
    });

    it("ignores close event after error already resolved the promise", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

      proc.emit("error", new Error("ENOENT"));
      // Simulate late close after error
      const xml = `<pmd><file name="Foo.java">
        <violation beginline="1" rule="CyclomaticComplexity" priority="3">
          The method 'a' has a cyclomatic complexity of 99.
        </violation></file></pmd>`;
      proc.stdout!.emit("data", Buffer.from(xml));
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

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 1);

      vi.advanceTimersByTime(1);

      const result = await promise;
      expect(result.size).toBe(0);
      expect(proc.kill).toHaveBeenCalled();
    });

    it("does not kill process when it completes before timeout", async () => {
      vi.useFakeTimers();
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

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

      const p1 = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/A.java", "/project", 5000);
      const p2 = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/B.java", "/project", 5000);

      const xml1 = `<pmd><file name="A.java">
        <violation beginline="1" rule="CyclomaticComplexity" priority="3">
          The method 'a' has a cyclomatic complexity of 3.
        </violation></file></pmd>`;
      const xml2 = `<pmd><file name="B.java">
        <violation beginline="2" rule="CyclomaticComplexity" priority="3">
          The method 'b' has a cyclomatic complexity of 8.
        </violation></file></pmd>`;

      proc1.stdout!.emit("data", Buffer.from(xml1));
      proc1.emit("close", 4);

      proc2.stdout!.emit("data", Buffer.from(xml2));
      proc2.emit("close", 4);

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

      runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/日本語/Foo.java", "/project", 5000);

      expect(vi.mocked(cp.spawn).mock.calls[0][1]).toContain("/src/日本語/Foo.java");

      proc.emit("close", 0);
    });

    it("passes empty string pmdPath to spawn without crashing", async () => {
      const proc = fakeProc();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("", "/src/Foo.java", "/project", 5000);

      proc.emit("error", new Error("ENOENT"));

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });

  describe("stdout with null", () => {
    it("returns empty map when stdout is null", async () => {
      const proc = new EventEmitter() as unknown as ChildProcess;
      (proc as any).stdout = null;
      proc.kill = vi.fn();
      vi.mocked(cp.spawn).mockReturnValue(proc);

      const promise = runPmdCyclomaticComplexity("/usr/bin/pmd", "/src/Foo.java", "/project", 5000);

      proc.emit("close", 0);

      const result = await promise;
      expect(result.size).toBe(0);
    });
  });
});
