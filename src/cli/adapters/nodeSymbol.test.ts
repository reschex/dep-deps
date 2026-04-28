/**
 * Tests for NodeSymbolProvider - TypeScript Symbol Extraction
 * 
 * Scenario: Extract function declarations
 * From: features/symbol-extraction.feature
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeSymbolProvider } from './nodeSymbol';

describe('NodeSymbolProvider - Function Extraction', () => {
  let tempDir: string;
  let provider: NodeSymbolProvider;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = join(tmpdir(), `ddp-symbol-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    provider = new NodeSymbolProvider();
  });

  afterAll(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Scenario: Extract function declarations', () => {
    it('should extract 1 symbol from function declaration', async () => {
      // Given a TypeScript file with content:
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then 1 symbol should be found
      expect(symbols.length).toBe(1);
    });

    it('should extract symbol name "processData"', async () => {
      // Given a TypeScript file with function processData
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData2.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then the symbol name should be "processData"
      expect(symbols[0].name).toBe('processData');
    });

    it('should identify correct body start and end lines', async () => {
      // Given a TypeScript file with function processData
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData3.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then the symbol body should start at line 1 (0-indexed: line 0)
      expect(symbols[0].bodyStartLine).toBe(0);
      
      // And the symbol body should end at line 6 (0-indexed: line 5)
      expect(symbols[0].bodyEndLine).toBe(5);
    });
  });
});
