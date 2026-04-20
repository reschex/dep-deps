/**
 * Integration tests that run against the actual git history of this repo.
 * The project itself (C:/code/dep-deps) is used as the test fixture.
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect } from "vitest";
import { runGitLog } from "./gitSpawn";
import { GitChurnAdapter } from "./gitChurnAdapter";

// Derive repo root from __dirname (3 levels up from src/ddp/churn/).
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT_URI = pathToFileURL(REPO_ROOT).href.replace(/\/$/, "");

const LOOKBACK_DAYS = 30;

function since(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

describe("runGitLog (integration)", () => {
  it("returns non-empty output for recent history", async () => {
    const output = await runGitLog(REPO_ROOT, since(LOOKBACK_DAYS), 15_000);
    expect(output.trim().length).toBeGreaterThan(0);
  });

  it("output contains at least one file path", async () => {
    const output = await runGitLog(REPO_ROOT, since(LOOKBACK_DAYS), 15_000);
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("returns empty output for a date in the far future", async () => {
    const future = new Date("2099-01-01T00:00:00Z");
    const output = await runGitLog(REPO_ROOT, future, 15_000);
    expect(output.trim()).toBe("");
  });
});

describe("GitChurnAdapter (integration)", () => {
  it("returns counts for files changed recently", async () => {
    const adapter = new GitChurnAdapter(REPO_ROOT_URI);
    const counts = await adapter.getChurnCounts(since(LOOKBACK_DAYS));
    expect(counts.size).toBeGreaterThan(0);
  });

  it("all returned keys are absolute file URIs", async () => {
    const adapter = new GitChurnAdapter(REPO_ROOT_URI);
    const counts = await adapter.getChurnCounts(since(LOOKBACK_DAYS));
    for (const key of counts.keys()) {
      expect(key).toMatch(/^file:\/\/\//);
    }
  });

  it("all counts are positive integers", async () => {
    const adapter = new GitChurnAdapter(REPO_ROOT_URI);
    const counts = await adapter.getChurnCounts(since(LOOKBACK_DAYS));
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(0);
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  it("returns empty map for a date in the far future", async () => {
    const adapter = new GitChurnAdapter(REPO_ROOT_URI);
    const counts = await adapter.getChurnCounts(new Date("2099-01-01T00:00:00Z"));
    expect(counts.size).toBe(0);
  });

  it("all URIs are rooted at the repo root URI", async () => {
    const adapter = new GitChurnAdapter(REPO_ROOT_URI);
    const counts = await adapter.getChurnCounts(since(LOOKBACK_DAYS));
    for (const key of counts.keys()) {
      expect(key.startsWith(`${REPO_ROOT_URI}/`)).toBe(true);
    }
  });
});
