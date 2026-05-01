/**
 * Tests for detectLanguageId — file extension to language ID mapping.
 *
 * From: features/python-symbol-extraction.feature, features/java-symbol-extraction.feature
 * Required by NativeSymbolProvider (Phase 1c, ADR-005).
 */

import { describe, it, expect } from 'vitest';
import { detectLanguageId } from './patterns';

describe('detectLanguageId', () => {
  it('should return "typescript" for .ts files', () => {
    expect(detectLanguageId('file:///project/src/app.ts')).toBe('typescript');
  });

  it('should return "typescriptreact" for .tsx files', () => {
    expect(detectLanguageId('file:///project/src/App.tsx')).toBe('typescriptreact');
  });

  it('should return "javascript" for .js files', () => {
    expect(detectLanguageId('file:///project/src/index.js')).toBe('javascript');
  });

  it('should return "javascriptreact" for .jsx files', () => {
    expect(detectLanguageId('file:///project/src/App.jsx')).toBe('javascriptreact');
  });

  it('should return "javascript" for .mjs files', () => {
    expect(detectLanguageId('file:///project/src/util.mjs')).toBe('javascript');
  });

  it('should return "javascript" for .cjs files', () => {
    expect(detectLanguageId('file:///project/src/config.cjs')).toBe('javascript');
  });

  it('should return "python" for .py files', () => {
    expect(detectLanguageId('file:///project/src/app.py')).toBe('python');
  });

  it('should return "java" for .java files', () => {
    expect(detectLanguageId('file:///project/src/App.java')).toBe('java');
  });

  it('should return "unknown" for unrecognized extensions', () => {
    expect(detectLanguageId('file:///project/src/readme.md')).toBe('unknown');
  });

  it('should handle uppercase extensions', () => {
    expect(detectLanguageId('file:///project/src/App.TS')).toBe('typescript');
  });

  it('should handle plain file paths (not URIs)', () => {
    expect(detectLanguageId('/project/src/app.py')).toBe('python');
  });

  it('should handle Windows-style paths', () => {
    expect(detectLanguageId('C:\\code\\project\\App.java')).toBe('java');
  });
});
