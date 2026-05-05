/**
 * Tests for shared symbol-search utilities.
 *
 * matchesFilePath and findSymbol extracted from cli/main.ts and
 * adapter/mcp/tools/analyzeFile.ts to eliminate duplicate path-boundary logic.
 */

import { describe, it, expect } from 'vitest';
import { matchesFilePath, findSymbol } from './symbolSearch';
import type { SymbolMetrics } from '../core/analyze';

describe('matchesFilePath', () => {
  it('matches when uri is exactly the normalised filePath', () => {
    expect(matchesFilePath('file:///src/utils.ts', 'file:///src/utils.ts')).toBe(true);
  });

  it('matches when uri ends with /filePath (relative path)', () => {
    expect(matchesFilePath('file:///src/utils.ts', 'src/utils.ts')).toBe(true);
  });

  it('does not match a filename that is a suffix of another filename', () => {
    expect(matchesFilePath('file:///src/myutils.ts', 'utils.ts')).toBe(false);
  });

  it('normalises Windows backslashes in filePath', () => {
    expect(matchesFilePath('file:///src/utils.ts', 'src\\utils.ts')).toBe(true);
  });

  it('normalises Windows backslashes in uri', () => {
    expect(matchesFilePath('file:///src\\utils.ts', 'src/utils.ts')).toBe(true);
  });

  it('returns false when neither exact nor suffix match', () => {
    expect(matchesFilePath('file:///src/other.ts', 'src/utils.ts')).toBe(false);
  });
});

function sym(id: string, uri: string, name: string): SymbolMetrics {
  return { id, uri, name, cc: 1, t: 0, r: 1, crap: 2, f: 2, g: 1, fPrime: 2 };
}

describe('findSymbol', () => {
  it('finds symbol by name and relative file path', () => {
    const s = sym('file:///src/utils.ts#1:0', 'file:///src/utils.ts', 'add');
    expect(findSymbol([s], 'src/utils.ts', 'add')).toBe(s);
  });

  it('finds symbol by name and absolute URI', () => {
    const s = sym('file:///src/utils.ts#1:0', 'file:///src/utils.ts', 'add');
    expect(findSymbol([s], 'file:///src/utils.ts', 'add')).toBe(s);
  });

  it('returns undefined when name does not match', () => {
    const s = sym('file:///src/utils.ts#1:0', 'file:///src/utils.ts', 'add');
    expect(findSymbol([s], 'src/utils.ts', 'subtract')).toBeUndefined();
  });

  it('returns undefined when file does not match', () => {
    const s = sym('file:///src/utils.ts#1:0', 'file:///src/utils.ts', 'add');
    expect(findSymbol([s], 'src/other.ts', 'add')).toBeUndefined();
  });

  it('does not match partial filename (boundary check)', () => {
    const s = sym('file:///src/myutils.ts#1:0', 'file:///src/myutils.ts', 'add');
    expect(findSymbol([s], 'utils.ts', 'add')).toBeUndefined();
  });

  it('normalises Windows backslashes in file parameter', () => {
    const s = sym('file:///src/utils.ts#1:0', 'file:///src/utils.ts', 'add');
    expect(findSymbol([s], 'src\\utils.ts', 'add')).toBe(s);
  });
});
