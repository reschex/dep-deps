/**
 * Tests for parsePythonSymbolsJson — Python symbol extraction JSON parser.
 *
 * Scenario: Extract top-level function
 * From: features/python-symbol-extraction.feature
 */

import { describe, it, expect } from 'vitest';
import { parsePythonSymbolsJson } from './symbolsParse';

describe('parsePythonSymbolsJson', () => {
  describe('Scenario: Extract top-level function', () => {
    it('should parse valid JSON with a single function into FunctionSymbolInfo[]', () => {
      const json = JSON.stringify([
        {
          name: 'top_level',
          selectionStartLine: 0,
          selectionStartCharacter: 0,
          bodyStartLine: 0,
          bodyEndLine: 1,
        },
      ]);

      const result = parsePythonSymbolsJson(json);

      expect(result).toEqual([
        {
          name: 'top_level',
          selectionStartLine: 0,
          selectionStartCharacter: 0,
          bodyStartLine: 0,
          bodyEndLine: 1,
        },
      ]);
    });
  });

  describe('Scenario: Graceful degradation on empty file', () => {
    it('should return [] for empty string input', () => {
      const result = parsePythonSymbolsJson('');
      expect(result).toEqual([]);
    });

    it('should return [] for whitespace-only input', () => {
      const result = parsePythonSymbolsJson('   \n  ');
      expect(result).toEqual([]);
    });
  });

  describe('Scenario: Graceful degradation on malformed JSON output', () => {
    it('should return [] for malformed JSON', () => {
      const result = parsePythonSymbolsJson('not json at all { broken');
      expect(result).toEqual([]);
    });

    it('should return [] for non-array JSON (object)', () => {
      const result = parsePythonSymbolsJson('{"name": "foo"}');
      expect(result).toEqual([]);
    });

    it('should return [] for JSON null', () => {
      const result = parsePythonSymbolsJson('null');
      expect(result).toEqual([]);
    });
  });

  describe('Scenario: Extract class methods', () => {
    it('should parse exactly 2 symbols from a class with method and async_method', () => {
      // Corresponds to feature: "Extract class methods" — only FunctionDef and AsyncFunctionDef
      // are counted, not the ClassDef itself.
      const json = JSON.stringify([
        { name: 'method', selectionStartLine: 1, selectionStartCharacter: 4, bodyStartLine: 1, bodyEndLine: 2 },
        { name: 'async_method', selectionStartLine: 4, selectionStartCharacter: 4, bodyStartLine: 4, bodyEndLine: 5 },
      ]);

      const result = parsePythonSymbolsJson(json);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name)).toEqual(['method', 'async_method']);
    });
  });

  describe('Scenario: Extract nested functions and class methods', () => {
    it('should parse multiple functions including class methods and nested functions', () => {
      const json = JSON.stringify([
        { name: 'top_level', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 1 },
        { name: 'method', selectionStartLine: 4, selectionStartCharacter: 4, bodyStartLine: 4, bodyEndLine: 5 },
        { name: 'async_method', selectionStartLine: 7, selectionStartCharacter: 4, bodyStartLine: 7, bodyEndLine: 8 },
        { name: 'outer', selectionStartLine: 10, selectionStartCharacter: 0, bodyStartLine: 10, bodyEndLine: 13 },
        { name: 'inner', selectionStartLine: 11, selectionStartCharacter: 4, bodyStartLine: 11, bodyEndLine: 12 },
      ]);

      const result = parsePythonSymbolsJson(json);

      expect(result).toHaveLength(5);
      expect(result.map((s) => s.name)).toEqual([
        'top_level', 'method', 'async_method', 'outer', 'inner',
      ]);
    });
  });

  describe('Scenario: Filter items with missing fields', () => {
    it('should skip items missing required fields', () => {
      const json = JSON.stringify([
        { name: 'valid', selectionStartLine: 0, selectionStartCharacter: 0, bodyStartLine: 0, bodyEndLine: 1 },
        { name: 'no_end_line', selectionStartLine: 3, selectionStartCharacter: 0, bodyStartLine: 3 },
        { selectionStartLine: 5, selectionStartCharacter: 0, bodyStartLine: 5, bodyEndLine: 6 },
        'not an object',
        42,
        null,
      ]);

      const result = parsePythonSymbolsJson(json);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
    });
  });
});
