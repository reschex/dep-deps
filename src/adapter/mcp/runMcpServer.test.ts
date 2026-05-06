/**
 * Tests for runMcpServer — entry-point orchestration extracted from bin.ts.
 *
 * Covers the wiring previously inlined in bin.ts:
 *   - loads .ddprc.json from the working directory
 *   - converts file config to CLI analysis options
 *   - injects baseOptions into runAnalysis (file-config values flow through)
 *   - formats errors with stack traces when available
 *
 * From: features/config-file.feature — "MCP server loads .ddprc.json for analysis".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('../../core/config', async () => {
  const actual = await vi.importActual<typeof import('../../core/config')>(
    '../../core/config',
  );
  return { ...actual, loadDdpConfig: vi.fn() };
});

vi.mock('../cli/cliAnalysis', () => ({
  runCliAnalysis: vi.fn().mockResolvedValue({ symbols: [], fileRollup: new Map(), edgesCount: 0, edges: [] }),
}));

vi.mock('./index', () => {
  const connect = vi.fn().mockResolvedValue(undefined);
  return {
    createMcpServer: vi.fn(() => ({ connect })),
    __getConnect: () => connect,
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────
import { loadDdpConfig, DDP_CONFIG_DEFAULTS } from '../../core/config';
import { runCliAnalysis } from '../cli/cliAnalysis';
import { createMcpServer } from './index';
import { runMcpServer, formatMcpError } from './runMcpServer';

describe('runMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDdpConfig).mockResolvedValue(DDP_CONFIG_DEFAULTS);
  });

  it('loads .ddprc.json from the provided rootPath', async () => {
    await runMcpServer({ rootPath: '/project' });

    expect(loadDdpConfig).toHaveBeenCalledWith('/project', expect.any(Function));
  });

  it('passes file-config values into runAnalysis via baseOptions', async () => {
    vi.mocked(loadDdpConfig).mockResolvedValue({
      ...DDP_CONFIG_DEFAULTS,
      maxFiles: 250,
      coverage: { ...DDP_CONFIG_DEFAULTS.coverage, lcovGlob: '**/custom/lcov.info' },
    });

    await runMcpServer({ rootPath: '/project' });

    // Invoke the runAnalysis closure that bin wired into the server.
    const serverOptions = vi.mocked(createMcpServer).mock.calls[0][0];
    await serverOptions.runAnalysis({ rootPath: '/project' });

    expect(runCliAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: '/project',
        maxFiles: 250,
        lcovGlob: '**/custom/lcov.info',
      }),
    );
  });

  it('does not let baseOptions override an explicit rootPath in tool requests', async () => {
    vi.mocked(loadDdpConfig).mockResolvedValue({ ...DDP_CONFIG_DEFAULTS, maxFiles: 250 });

    await runMcpServer({ rootPath: '/project' });

    const serverOptions = vi.mocked(createMcpServer).mock.calls[0][0];
    await serverOptions.runAnalysis({ rootPath: '/elsewhere' });

    expect(runCliAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/elsewhere', maxFiles: 250 }),
    );
  });
});

describe('formatMcpError', () => {
  it('includes the stack trace when err is an Error with a stack', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at frame1\n    at frame2';

    const out = formatMcpError(err);

    expect(out).toContain('Error: boom');
    expect(out).toContain('frame1');
  });

  it('falls back to err.message when stack is missing', () => {
    const err = new Error('no stack');
    err.stack = undefined;

    const out = formatMcpError(err);

    expect(out).toContain('no stack');
  });

  it('coerces non-Error values to string', () => {
    const out = formatMcpError('plain string');

    expect(out).toContain('plain string');
  });

  it('coerces non-Error objects via String()', () => {
    const out = formatMcpError({ toString: () => 'custom-toString' });

    expect(out).toContain('custom-toString');
  });
});
