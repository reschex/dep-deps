import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

import * as cp from "child_process";
import { runGitLog } from "./gitSpawn";
import { fakeProc } from "../../../shared/fakeProc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("runGitLog", () => {
  it("calls git log with --name-only, --pretty=format:, and --since", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const since = new Date("2026-01-20T12:00:00.000Z");
    runGitLog("/repo", since, 5000);

    expect(cp.spawn).toHaveBeenCalledOnce();
    const [cmd, args, opts] = vi.mocked(cp.spawn).mock.calls[0];
    expect(cmd).toBe("git");
    expect(args).toContain("log");
    expect(args).toContain("--name-only");
    expect(args).toContain("--pretty=format:");
    expect(args.some((a: string) => a.startsWith("--since="))).toBe(true);
    expect(opts).toMatchObject({ cwd: "/repo", windowsHide: true });

    proc.emit("close", 0);
  });

  it("includes the ISO date in the --since argument", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const since = new Date("2026-01-20T12:00:00.000Z");
    runGitLog("/repo", since, 5000);

    const args = vi.mocked(cp.spawn).mock.calls[0][1] as string[];
    const sinceArg = args.find((a) => a.startsWith("--since="));
    expect(sinceArg).toBe(`--since=${since.toISOString()}`);

    proc.emit("close", 0);
  });

  it("returns stdout output on successful close", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const since = new Date("2026-01-01T00:00:00.000Z");
    const promise = runGitLog("/repo", since, 5000);

    proc.stdout!.emit("data", Buffer.from("\nsrc/foo.ts\n\nsrc/bar.ts\n"));
    proc.emit("close", 0);

    expect(await promise).toBe("\nsrc/foo.ts\n\nsrc/bar.ts\n");
  });

  it("concatenates multiple stdout chunks", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runGitLog("/repo", new Date(), 5000);

    proc.stdout!.emit("data", Buffer.from("src/a"));
    proc.stdout!.emit("data", Buffer.from(".ts\n"));
    proc.emit("close", 0);

    expect(await promise).toBe("src/a.ts\n");
  });

  it("returns empty string on timeout and kills the process", async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runGitLog("/repo", new Date(), 3000);
    vi.advanceTimersByTime(3000);

    expect(await promise).toBe("");
    expect(proc.kill).toHaveBeenCalled();
  });

  it("returns empty string when spawn emits error", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runGitLog("/repo", new Date(), 5000);
    proc.emit("error", new Error("ENOENT"));

    expect(await promise).toBe("");
  });

  it("returns empty string when stdout is null", async () => {
    const proc = fakeProc();
    (proc as any).stdout = null;
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runGitLog("/repo", new Date(), 5000);
    proc.emit("close", 0);

    expect(await promise).toBe("");
  });

  it("resolves only once when both close and error fire", async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runGitLog("/repo", new Date(), 5000);
    proc.stdout!.emit("data", Buffer.from("src/foo.ts\n"));
    proc.emit("close", 0);
    proc.emit("error", new Error("late"));

    expect(await promise).toBe("src/foo.ts\n");
  });
});
