/**
 * Tests for NodeCallGraphProvider — wraps buildTypeScriptCallEdges as CallGraphProvider port.
 *
 * From: features/typescript-call-graph.feature
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock functions — referenced by the mock factory and by test assertions
const mockFindSourceFiles = vi.fn<(maxFiles: number, rootUri?: string) => Promise<string[]>>();

vi.mock('../../adapter/cli/nodeDocument', () => ({
  NodeDocumentProvider: class {
    findSourceFiles = mockFindSourceFiles;
  },
}));

vi.mock('./callGraphBuild', () => ({
  buildTypeScriptCallEdges: vi.fn<(rootPath: string, fileUris: string[]) => Promise<{ caller: string; callee: string }[]>>(),
}));

import { NodeCallGraphProvider } from './callGraph';
import { buildTypeScriptCallEdges } from './callGraphBuild';

const mockedBuild = vi.mocked(buildTypeScriptCallEdges);

describe('NodeCallGraphProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover files, filter to TS/JS, and delegate to buildTypeScriptCallEdges', async () => {
    const provider = new NodeCallGraphProvider('/workspace');

    mockFindSourceFiles.mockResolvedValue([
      'file:///workspace/src/app.ts',
      'file:///workspace/src/util.js',
      'file:///workspace/src/data.py',
      'file:///workspace/src/Main.java',
      'file:///workspace/src/style.css',
    ]);

    mockedBuild.mockResolvedValue([
      { caller: 'file:///workspace/src/app.ts#0:0', callee: 'file:///workspace/src/util.js#0:0' },
    ]);

    const edges = await provider.collectCallEdges(100);

    // Should only pass TS/JS files to buildTypeScriptCallEdges
    expect(mockedBuild).toHaveBeenCalledWith('/workspace', [
      'file:///workspace/src/app.ts',
      'file:///workspace/src/util.js',
    ]);

    expect(edges).toHaveLength(1);
  });

  it('should pass maxFiles and rootUri to file discovery', async () => {
    const provider = new NodeCallGraphProvider('/workspace');

    mockFindSourceFiles.mockResolvedValue([]);
    mockedBuild.mockResolvedValue([]);

    await provider.collectCallEdges(50, 'file:///workspace/src');

    expect(mockFindSourceFiles).toHaveBeenCalledWith(50, 'file:///workspace/src');
  });

  it('should return empty edges when no TS/JS files are found', async () => {
    const provider = new NodeCallGraphProvider('/workspace');

    mockFindSourceFiles.mockResolvedValue([
      'file:///workspace/src/data.py',
      'file:///workspace/src/Main.java',
    ]);

    mockedBuild.mockResolvedValue([]);

    const edges = await provider.collectCallEdges(100);

    expect(mockedBuild).toHaveBeenCalledWith('/workspace', []);
    expect(edges).toHaveLength(0);
  });

  it('should filter .tsx, .jsx, .mjs, .cjs extensions as TS/JS files', async () => {
    const provider = new NodeCallGraphProvider('/workspace');

    mockFindSourceFiles.mockResolvedValue([
      'file:///workspace/src/App.tsx',
      'file:///workspace/src/Component.jsx',
      'file:///workspace/src/config.mjs',
      'file:///workspace/src/setup.cjs',
    ]);

    mockedBuild.mockResolvedValue([]);

    await provider.collectCallEdges(100);

    expect(mockedBuild).toHaveBeenCalledWith('/workspace', [
      'file:///workspace/src/App.tsx',
      'file:///workspace/src/Component.jsx',
      'file:///workspace/src/config.mjs',
      'file:///workspace/src/setup.cjs',
    ]);
  });
});
