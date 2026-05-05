/**
 * Tests for NativeSymbolProvider — dispatches to language-native symbol extractors.
 *
 * From: ADR-005 Phase 1c
 * Replaces VsCodeSymbolProvider with deterministic, extension-independent extraction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FunctionSymbolInfo } from '../core/ports';

// Create stub instances that tests can inspect
const tsFunctionSymbols = vi.fn<(uri: string) => Promise<FunctionSymbolInfo[]>>();
const pyFunctionSymbols = vi.fn<(uri: string) => Promise<FunctionSymbolInfo[]>>();
const javaFunctionSymbols = vi.fn<(uri: string) => Promise<FunctionSymbolInfo[]>>();

// Capture arrays record the constructor arguments each sub-provider was called with.
// Reset in beforeEach to avoid cross-test pollution.
let lastPythonCtorArgs: unknown[] = [];
let lastJavaCtorArgs: unknown[] = [];

vi.mock('./typescript/symbols', () => ({
  NodeSymbolProvider: class { getFunctionSymbols = tsFunctionSymbols; },
}));

vi.mock('./python/symbols', () => ({
  PythonSymbolProvider: class {
    constructor(...args: unknown[]) { lastPythonCtorArgs = args; }
    getFunctionSymbols = pyFunctionSymbols;
  },
}));

vi.mock('./java/nativeSymbols', () => ({
  JavaNativeSymbolProvider: class {
    constructor(...args: unknown[]) { lastJavaCtorArgs = args; }
    getFunctionSymbols = javaFunctionSymbols;
  },
}));

import { NativeSymbolProvider } from './nativeSymbolProvider';

beforeEach(() => {
  vi.clearAllMocks();
  tsFunctionSymbols.mockResolvedValue([]);
  pyFunctionSymbols.mockResolvedValue([]);
  javaFunctionSymbols.mockResolvedValue([]);
  lastPythonCtorArgs = [];
  lastJavaCtorArgs = [];
});

describe('NativeSymbolProvider', () => {
  it('should dispatch .ts files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([
      { name: 'tsFunc', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 5 },
    ]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/app.ts');

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('tsFunc');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/app.ts');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .tsx files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([{ name: 'Component', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/App.tsx');

    expect(symbols[0].name).toBe('Component');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/App.tsx');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .js files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([{ name: 'jsFunc', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 2 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/index.js');

    expect(symbols[0].name).toBe('jsFunc');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/index.js');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .jsx files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([{ name: 'JsxComp', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 2 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/App.jsx');

    expect(symbols[0].name).toBe('JsxComp');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/App.jsx');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .py files to PythonSymbolProvider', async () => {
    pyFunctionSymbols.mockResolvedValue([{ name: 'pyFunc', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 3 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/app.py');

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('pyFunc');
    expect(pyFunctionSymbols).toHaveBeenCalledWith('file:///project/src/app.py');
    expect(tsFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .java files to JavaSymbolProvider', async () => {
    javaFunctionSymbols.mockResolvedValue([{ name: 'javaMethod', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 10 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/App.java');

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('javaMethod');
    expect(javaFunctionSymbols).toHaveBeenCalledWith('file:///project/src/App.java');
    expect(tsFunctionSymbols).not.toHaveBeenCalled();
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should return [] for unknown file extensions', async () => {
    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/README.md');

    expect(symbols).toEqual([]);
    expect(tsFunctionSymbols).not.toHaveBeenCalled();
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .mjs files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([{ name: 'esmFunc', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 1 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/util.mjs');

    expect(symbols[0].name).toBe('esmFunc');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/util.mjs');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should dispatch .cjs files to NodeSymbolProvider', async () => {
    tsFunctionSymbols.mockResolvedValue([{ name: 'cjsFunc', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 1 }]);

    const provider = new NativeSymbolProvider();
    const symbols = await provider.getFunctionSymbols('file:///project/src/config.cjs');

    expect(symbols[0].name).toBe('cjsFunc');
    expect(tsFunctionSymbols).toHaveBeenCalledWith('file:///project/src/config.cjs');
    expect(pyFunctionSymbols).not.toHaveBeenCalled();
    expect(javaFunctionSymbols).not.toHaveBeenCalled();
  });

  it('should forward pythonPath to PythonSymbolProvider constructor', () => {
    new NativeSymbolProvider({ pythonPath: '/opt/python3', pmdPath: '/opt/pmd' });

    expect(lastPythonCtorArgs[0]).toBe('/opt/python3');
  });

  it('should forward pythonTimeoutMs to PythonSymbolProvider constructor', () => {
    new NativeSymbolProvider({ pythonTimeoutMs: 5_000, javaTimeoutMs: 15_000 });

    expect(lastPythonCtorArgs[1]).toBe(5_000);
  });

  it('should construct JavaNativeSymbolProvider with no arguments', () => {
    new NativeSymbolProvider({ pmdPath: '/opt/pmd', javaTimeoutMs: 15_000 });

    // JavaNativeSymbolProvider takes no args — parses source directly, no PMD
    expect(lastJavaCtorArgs).toHaveLength(0);
  });
});
