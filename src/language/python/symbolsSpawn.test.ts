/**
 * Tests for runPythonSymbolExtraction — Python symbol extraction subprocess.
 *
 * From: features/python-symbol-extraction.feature
 * Follows the same fakeProc pattern as radonSpawn.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import * as cp from 'child_process';
import { runPythonSymbolExtraction } from './symbolsSpawn';
import { fakeProc } from '../../shared/fakeProc';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('runPythonSymbolExtraction', () => {
  it('should pass correct arguments to cp.spawn', async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    // Capture the promise before asserting so we can await it cleanly after.
    // Without capturing, a failed assertion would leave an unresolved timeout
    // leaking into subsequent tests.
    const promise = runPythonSymbolExtraction('python3', '/src/app.py', '/project', 5000);

    expect(cp.spawn).toHaveBeenCalledWith(
      'python3',
      ['-c', expect.any(String), '/src/app.py'],
      { cwd: '/project', windowsHide: true }
    );

    proc.emit('close', 0);
    await promise;
  });

  it('should return stdout content on successful execution', async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPythonSymbolExtraction('python3', '/src/app.py', '/project', 5000);

    const json = JSON.stringify([{ name: 'foo', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 1 }]);
    proc.stdout!.emit('data', Buffer.from(json));
    proc.emit('close', 0);

    const result = await promise;
    expect(result).toBe(json);
  });

  it('should return empty string when timeout expires', async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPythonSymbolExtraction('python3', '/src/app.py', '/project', 3000);
    vi.advanceTimersByTime(3000);

    const result = await promise;
    expect(result).toBe('');
    expect(proc.kill).toHaveBeenCalled();
  });

  it('should return empty string when spawn emits error', async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPythonSymbolExtraction('python3', '/src/app.py', '/project', 5000);
    proc.emit('error', new Error('ENOENT'));

    const result = await promise;
    expect(result).toBe('');
  });

  it('should include inline Python script using ast module in args', async () => {
    const proc = fakeProc();
    vi.mocked(cp.spawn).mockReturnValue(proc);

    const promise = runPythonSymbolExtraction('python3', '/src/app.py', '/project', 5000);

    const args = vi.mocked(cp.spawn).mock.calls[0][1] as string[];
    const script = args[1]; // -c <script> <filepath>
    expect(script).toContain('import ast');
    expect(script).toContain('json');
    expect(script).toContain('FunctionDef');
    expect(script).toContain('AsyncFunctionDef');

    proc.emit('close', 0);
    await promise;
  });
});
