/**
 * Node.js adapter for DocumentProvider port interface.
 * 
 * Implements file discovery and document access using Node.js file system APIs,
 * without VS Code dependencies.
 */

import { glob } from 'glob';
import { pathToFileURL } from 'url';
import type { DocumentProvider, DocumentInfo } from '../../core/ports';

const SOURCE_FILE_PATTERN = '**/*.{ts,tsx,js,jsx}';
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/.git/**',
];

/** Patterns that identify test files */
const TEST_FILE_PATTERNS = ['.test.', '.spec.', '/tests/', '\\tests\\'];

/**
 * Node.js implementation of DocumentProvider for CLI analysis.
 * Uses glob for file discovery without VS Code dependencies.
 */
export class NodeDocumentProvider implements DocumentProvider {
  constructor(
    private readonly rootPath: string,
    private readonly excludeTests: boolean = true
  ) {}

  /**
   * Find source files matching TypeScript/JavaScript patterns.
   * @param maxFiles Maximum files to return
   * @param rootUri Optional URI to scope the search
   * @returns Array of file URIs
   */
  async findSourceFiles(maxFiles: number, rootUri?: string): Promise<string[]> {
    const searchRoot = rootUri ? new URL(rootUri).pathname : this.rootPath;
    
    const files = await glob(SOURCE_FILE_PATTERN, {
      cwd: searchRoot,
      ignore: EXCLUDE_PATTERNS,
      absolute: true,
      nodir: true,
    });
    
    let uris = files.map(f => pathToFileURL(f).toString());
    
    if (this.excludeTests) {
      uris = uris.filter(uri => !this.isTestFile(uri));
    }
    
    return uris.slice(0, maxFiles);
  }

  /**
   * Open a document by URI.
   * @throws Not implemented in MVP - to be added when symbol extraction is needed
   */
  async openDocument(_uri: string): Promise<DocumentInfo | undefined> {
    throw new Error('openDocument not implemented in MVP');
  }

  private isTestFile(_uri: string): boolean {
    return TEST_FILE_PATTERNS.some(pattern => _uri.includes(pattern));
  }
}
