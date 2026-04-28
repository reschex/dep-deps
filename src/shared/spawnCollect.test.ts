import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

import * as cp from "child_process";
import { spawnAndCollect } from "./spawnCollect";
import { fakeProc } from "./fakeProc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("spawnAndCollect", () => {
  it("returns stdout on successful close", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("cmd", ["arg1"], "/cwd", 5000);
    proc.stdout!.emit("data", Buffer.from("hello"));
    proc.emit("close");

    expect(await promise).toBe("hello");
  });

  it("concatenates multiple stdout chunks", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("cmd", ["a"], "/cwd", 5000);
    proc.stdout!.emit("data", Buffer.from("foo"));
    proc.stdout!.emit("data", Buffer.from("bar"));
    proc.emit("close");

    expect(await promise).toBe("foobar");
  });

  it("returns empty string on error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("cmd", [], "/cwd", 5000);
    proc.emit("error", new Error("ENOENT"));

    expect(await promise).toBe("");
  });

  it("returns empty string and kills process on timeout", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("cmd", [], "/cwd", 100);
    vi.advanceTimersByTime(100);
    proc.emit("close");

    expect(await promise).toBe("");
    expect(proc.kill).toHaveBeenCalled();
  });

  it("resolves only once even if close fires after error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("cmd", [], "/cwd", 5000);
    proc.stdout!.emit("data", Buffer.from("data"));
    proc.emit("error", new Error("fail"));
    proc.emit("close");

    expect(await promise).toBe("");
  });

  it("passes cwd and windowsHide to spawn", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = spawnAndCollect("eslint", ["file.ts"], "/my/cwd", 5000);
    proc.emit("close");
    await promise;

    expect(cp.spawn).toHaveBeenCalledWith("eslint", ["file.ts"], {
      cwd: "/my/cwd",
      windowsHide: true,
    });
  });
});
