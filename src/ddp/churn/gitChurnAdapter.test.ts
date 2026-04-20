import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./gitSpawn", () => ({ runGitLog: vi.fn() }));

import { runGitLog } from "./gitSpawn";
import { GitChurnAdapter } from "./gitChurnAdapter";

beforeEach(() => vi.clearAllMocks());

// Repo root expressed as a file URI (the format analysisService.ts passes)
const REPO_URI = "file:///c%3A/code/proj";

describe("GitChurnAdapter", () => {
  it("returns commit counts keyed by absolute file URI", async () => {
    vi.mocked(runGitLog).mockResolvedValue("\nsrc/foo.ts\n\nsrc/foo.ts\nsrc/bar.ts\n");
    const adapter = new GitChurnAdapter(REPO_URI);
    const counts = await adapter.getChurnCounts(new Date());

    expect(counts.get(`${REPO_URI}/src/foo.ts`)).toBe(2);
    expect(counts.get(`${REPO_URI}/src/bar.ts`)).toBe(1);
  });

  it("returns empty map when git produces no output", async () => {
    vi.mocked(runGitLog).mockResolvedValue("");
    const adapter = new GitChurnAdapter(REPO_URI);
    const counts = await adapter.getChurnCounts(new Date());
    expect(counts.size).toBe(0);
  });

  it("passes the since date to runGitLog", async () => {
    vi.mocked(runGitLog).mockResolvedValue("");
    const since = new Date("2026-01-01T00:00:00.000Z");
    const adapter = new GitChurnAdapter(REPO_URI);
    await adapter.getChurnCounts(since);

    const [, passedSince] = vi.mocked(runGitLog).mock.calls[0];
    expect(passedSince).toBe(since);
  });

  it("handles repo URI with trailing slash", async () => {
    vi.mocked(runGitLog).mockResolvedValue("\nsrc/a.ts\n");
    const adapter = new GitChurnAdapter("file:///c%3A/code/proj/");
    const counts = await adapter.getChurnCounts(new Date());

    expect(counts.get("file:///c%3A/code/proj/src/a.ts")).toBe(1);
  });

  it("works with a deeply nested relative path", async () => {
    vi.mocked(runGitLog).mockResolvedValue("\nsrc/core/utils/deep.ts\n");
    const adapter = new GitChurnAdapter(REPO_URI);
    const counts = await adapter.getChurnCounts(new Date());

    expect(counts.get(`${REPO_URI}/src/core/utils/deep.ts`)).toBe(1);
  });

  it("throws a descriptive error when constructed with a malformed URI", () => {
    expect(() => new GitChurnAdapter("not-a-valid-uri")).toThrow(/not-a-valid-uri/);
  });
});
