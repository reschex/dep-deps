/**
 * Node.js adapter for DocumentProvider port interface.
 * 
 * Implements file discovery and document access using Node.js file system APIs,
 * without VS Code dependencies.
 */

import { glob } from 'glob';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';
import { SOURCE_FILE_GLOB } from '../../language/patterns';
import type { DocumentProvider, DocumentInfo } from '../../core/ports';

/**
 * Build-output and VCS directories to exclude from file discovery.
 * Intentionally broader than the canonical EXCLUDE_GLOB (node_modules only)
 * because the CLI runs across arbitrary projects that commonly have these directories.
 */
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/.git/**',
];

/**
 * Node.js implementation of DocumentProvider for CLI analysis.
 * Uses glob for file discovery without VS Code dependencies.
 *
 * Test-file exclusion is deliberately NOT handled here — that concern belongs to
 * AnalysisOrchestrator, which applies the canonical isTestFileUri filter when
 * config.excludeTests is true. Keeping the provider neutral avoids double-filtering
 * with two divergent implementations.
 */
export class NodeDocumentProvider implements DocumentProvider {
  constructor(private readonly rootPath: string) {}

  /**
   * Find source files matching all supported language extensions.
   * @param maxFiles Maximum files to return
   * @param rootUri Optional URI to scope the search
   * @returns Array of file URIs (includes test files — caller filters if needed)
   */
  async findSourceFiles(maxFiles: number, rootUri?: string): Promise<string[]> {
    const searchRoot = rootUri ? new URL(rootUri).pathname : this.rootPath;

    const files = await glob(SOURCE_FILE_GLOB, {
      cwd: searchRoot,
      ignore: EXCLUDE_PATTERNS,
      absolute: true,
      nodir: true,
    });

    const uris = files.map(f => pathToFileURL(f).toString());
    return uris.slice(0, maxFiles);
  }

  /**
   * Open a document by URI, reading its contents from disk.
   * @param uri File URI (file:// scheme) or absolute file path
   * @returns DocumentInfo with languageId, getText(), or undefined if unreadable
   */
  async openDocument(uri: string): Promise<DocumentInfo | undefined> {
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return undefined;
    }
    const lines = content.split(/\r?\n/);
    const languageId = languageIdFromExtension(extname(filePath));

    return {
      uri,
      languageId,
      getText(startLine: number, endLine: number): string {
        return lines.slice(startLine, endLine + 1).join('\n');
      },
    };
  }
}

/** Map file extension to VS Code-compatible language identifier. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
};

function languageIdFromExtension(ext: string): string {
  return EXTENSION_TO_LANGUAGE[ext.toLowerCase()] ?? 'plaintext';
}
