/**
 * Tests for NodeDocumentProvider - File Discovery & Document Access
 *
 * Scenarios from:
 *   - features/file-discovery.feature
 *   - features/symbol-extraction.feature (openDocument is prerequisite)
 *   - features/coverage-integration.feature (openDocument for CC fallback)
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { NodeDocumentProvider } from './nodeDocument';

const FIXTURE_PATH = join(__dirname, '../../test/fixtures/cli/simple-project');

describe('NodeDocumentProvider - File Discovery', () => {
  describe('Scenario: Test-file exclusion is the orchestrator\'s responsibility', () => {
    it('should include test files in discovered files (filtering delegated to orchestrator)', async () => {
      // Given a project containing utils.test.ts
      const provider = new NodeDocumentProvider(FIXTURE_PATH);

      // When I discover source files
      const files = await provider.findSourceFiles(100);

      // Then test files should be present — NodeDocumentProvider does not filter them
      const hasTestFile = files.some(f => f.includes('utils.test.ts'));
      expect(hasTestFile).toBe(true);
    });
  });

  describe('Scenario: Find TypeScript and JavaScript files', () => {
    it('should discover files matching **/*.{ts,tsx,js,jsx,mjs,cjs,py,java}', async () => {
      // Given a project with TypeScript files
      const provider = new NodeDocumentProvider(FIXTURE_PATH);

      // When I run analysis on the project
      const files = await provider.findSourceFiles(100);

      // Then files should be discovered
      expect(files.length).toBeGreaterThan(0);

      // And files should match all supported source-file extensions
      const VALID_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java'];
      const hasValidExtensions = files.every(file =>
        VALID_EXTENSIONS.some(ext => file.endsWith(ext))
      );
      expect(hasValidExtensions).toBe(true);
    });

    it('should discover Python (.py) source files', async () => {
      // Given a project that includes a .py file (src/helper.py)
      const provider = new NodeDocumentProvider(FIXTURE_PATH);

      // When I run analysis
      const files = await provider.findSourceFiles(100);

      // Then .py files should be discovered
      const hasPython = files.some(f => f.endsWith('.py'));
      expect(hasPython).toBe(true);
    });

    it('should include src/utils.ts', async () => {
      // Given a project with src/utils.ts
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      
      // When I run analysis
      const files = await provider.findSourceFiles(100);
      
      // Then src/utils.ts should be included
      const hasUtils = files.some(f => f.includes('src/utils.ts') || f.includes('src\\utils.ts'));
      expect(hasUtils).toBe(true);
    });

    it('should include src/main.ts', async () => {
      // Given a project with src/main.ts
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      
      // When I run analysis
      const files = await provider.findSourceFiles(100);
      
      // Then src/main.ts should be included
      const hasMain = files.some(f => f.includes('src/main.ts') || f.includes('src\\main.ts'));
      expect(hasMain).toBe(true);
    });
  });
});

describe('NodeDocumentProvider - openDocument', () => {
  describe('Scenario: Open a TypeScript file and return DocumentInfo', () => {
    it('should return DocumentInfo with correct uri for a file:// URI', async () => {
      // Given a TypeScript file at src/utils.ts in the fixture project
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      const absPath = join(FIXTURE_PATH, 'src', 'utils.ts');
      const fileUri = pathToFileURL(absPath).toString();

      // When I open the document by URI
      const doc = await provider.openDocument(fileUri);

      // Then DocumentInfo should be returned
      expect(doc).toBeDefined();
      // And the uri should match the input
      expect(doc!.uri).toBe(fileUri);
    });

    it('should return languageId "typescript" for a .ts file', async () => {
      // Given a .ts file
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      const absPath = join(FIXTURE_PATH, 'src', 'utils.ts');
      const fileUri = pathToFileURL(absPath).toString();

      // When I open the document
      const doc = await provider.openDocument(fileUri);

      // Then languageId should be "typescript"
      expect(doc!.languageId).toBe('typescript');
    });

    it('should provide getText() that returns content for a line range', async () => {
      // Given src/utils.ts contains:
      //   line 0: "// Test fixture file"
      //   line 1: "export function add(a: number, b: number): number {"
      //   line 2: "  return a + b;"
      //   line 3: "}"
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      const absPath = join(FIXTURE_PATH, 'src', 'utils.ts');
      const fileUri = pathToFileURL(absPath).toString();

      // When I open the document and get text for lines 1-3 (the function body)
      const doc = await provider.openDocument(fileUri);
      const text = doc!.getText(1, 3);

      // Then the text should contain the function body
      expect(text).toContain('export function add');
      expect(text).toContain('return a + b');
    });
  });

  describe('Scenario: Handle non-existent file gracefully', () => {
    it('should return undefined for a file that does not exist', async () => {
      // Given a URI pointing to a non-existent file
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      const absPath = join(FIXTURE_PATH, 'src', 'does-not-exist.ts');
      const fileUri = pathToFileURL(absPath).toString();

      // When I try to open the document
      const doc = await provider.openDocument(fileUri);

      // Then undefined should be returned (graceful failure, no throw)
      expect(doc).toBeUndefined();
    });
  });

  describe('Scenario: Language ID detection for various extensions', () => {
    it('should return "javascript" for a .js file', async () => {
      // Given a .js file in the fixture project (src/helper.js)
      const provider = new NodeDocumentProvider(FIXTURE_PATH);
      const files = await provider.findSourceFiles(100);
      const jsFile = files.find(f => f.endsWith('.js'));

      // Require a .js file to exist — this will fail if the fixture is missing helper.js
      expect(jsFile).toBeDefined();

      // When I open the document
      const doc = await provider.openDocument(jsFile!);

      // Then languageId should be "javascript"
      expect(doc!.languageId).toBe('javascript');
    });
  });
});
