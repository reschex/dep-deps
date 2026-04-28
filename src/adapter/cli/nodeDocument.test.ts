/**
 * Tests for NodeDocumentProvider - File Discovery
 * 
 * Scenario: Find TypeScript and JavaScript files
 * From: features/file-discovery.feature
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { NodeDocumentProvider } from './nodeDocument';

const FIXTURE_PATH = join(__dirname, '../../test/fixtures/cli/simple-project');

describe('NodeDocumentProvider - File Discovery', () => {
  describe('Scenario: Find TypeScript and JavaScript files', () => {
    it('should discover files matching **/*.{ts,tsx,js,jsx}', async () => {
      // Given a project with TypeScript files
      const provider = new NodeDocumentProvider(FIXTURE_PATH, true);
      
      // When I run analysis on the project
      const files = await provider.findSourceFiles(100);
      
      // Then files should be discovered
      expect(files.length).toBeGreaterThan(0);
      
      // And files should match TypeScript/JavaScript patterns
      const hasValidExtensions = files.every(file => 
        file.endsWith('.ts') || 
        file.endsWith('.tsx') || 
        file.endsWith('.js') || 
        file.endsWith('.jsx')
      );
      expect(hasValidExtensions).toBe(true);
    });

    it('should include src/utils.ts', async () => {
      // Given a project with src/utils.ts
      const provider = new NodeDocumentProvider(FIXTURE_PATH, true);
      
      // When I run analysis
      const files = await provider.findSourceFiles(100);
      
      // Then src/utils.ts should be included
      const hasUtils = files.some(f => f.includes('src/utils.ts') || f.includes('src\\utils.ts'));
      expect(hasUtils).toBe(true);
    });

    it('should include src/main.ts', async () => {
      // Given a project with src/main.ts
      const provider = new NodeDocumentProvider(FIXTURE_PATH, true);
      
      // When I run analysis
      const files = await provider.findSourceFiles(100);
      
      // Then src/main.ts should be included
      const hasMain = files.some(f => f.includes('src/main.ts') || f.includes('src\\main.ts'));
      expect(hasMain).toBe(true);
    });
  });
});
