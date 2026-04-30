/**
 * Node.js adapter for CoverageProvider port interface.
 *
 * Loads LCOV coverage data from the file system using glob for file discovery,
 * without VS Code dependencies. Reuses the shared LCOV parser from core.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'url';
import { glob } from 'glob';
import { parseLcovToStatementCovers, mergeLcovMaps } from '../../core/lcovParse';
import type { CoverageProvider } from '../../core/ports';
import type { StatementCover } from '../../core/coverageMap';

/**
 * Node.js implementation of CoverageProvider for CLI analysis.
 * Discovers LCOV files via glob and loads them into a URI-keyed map.
 */
export class NodeCoverageProvider implements CoverageProvider {
  private statements = new Map<string, StatementCover[]>();

  constructor(
    private readonly rootPath: string,
    private readonly lcovGlob: string
  ) {}

  async loadCoverage(): Promise<void> {
    this.statements.clear();

    const lcovFiles = await glob(this.lcovGlob, {
      cwd: this.rootPath,
      absolute: true,
      nodir: true,
    });

    const maps: Map<string, StatementCover[]>[] = [];
    for (const lcovPath of lcovFiles) {
      const text = await readFile(lcovPath, 'utf-8');
      const parsed = parseLcovToStatementCovers(text);
      // Convert relative file paths from LCOV to absolute file:// URIs
      const uriKeyed = new Map<string, StatementCover[]>();
      for (const [filePath, stmts] of parsed) {
        const absPath = resolve(this.rootPath, filePath);
        const uri = pathToFileURL(absPath).toString();
        uriKeyed.set(uri, stmts);
      }
      maps.push(uriKeyed);
    }

    this.statements = mergeLcovMaps(maps);
  }

  getStatements(uri: string): StatementCover[] | undefined {
    return this.statements.get(uri);
  }
}
