import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { vi } from "vitest";

export function fakeProc(): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as any).stdout = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}
