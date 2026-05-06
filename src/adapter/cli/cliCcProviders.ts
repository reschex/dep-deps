/**
 * CLI-side CC provider adapters.
 *
 * Mirror the VS Code-side providers in `adapter/vscode/adapters.ts` but
 * resolve `fsPath` from a `file://` URI without depending on `vscode.Uri`.
 *
 * Each provider is a thin adapter that converts the document URI to a
 * filesystem path and forwards to the language-specific helper which
 * does the real work (spawn ESLint / Radon / PMD).
 */

import { fileURLToPath } from 'node:url';
import type {
  CyclomaticComplexityProvider,
  CcResult,
  DocumentInfo,
} from '../../core/ports';
import { eslintCcForFile } from '../../language/typescript/cc/eslintComplexity';
import { radonCcForFile } from '../../language/python/cc/radonCc';
import { pmdCcForFile } from '../../language/java/cc/pmdComplexity';

/** Convert a `file://` URI to a filesystem path; return `undefined` for non-file URIs. */
function tryFsPath(uri: string): string | undefined {
  if (!uri.startsWith('file:')) return undefined;
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

/** Empty CC result helper. */
function emptyCcResult(): CcResult {
  return { byLine: new Map(), byName: new Map() };
}

/** ESLint-backed CC provider for TypeScript/JavaScript (CLI). */
export class CliEslintCcProvider implements CyclomaticComplexityProvider {
  constructor(
    private readonly eslintPath: string,
    private readonly cwd: string,
  ) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const fsPath = tryFsPath(doc.uri);
    if (!fsPath) return emptyCcResult();
    const byLine = await eslintCcForFile(doc.languageId, fsPath, this.cwd, this.eslintPath);
    return { byLine, byName: new Map() };
  }
}

/** Radon-backed CC provider for Python (CLI). */
export class CliRadonCcProvider implements CyclomaticComplexityProvider {
  constructor(
    private readonly pythonPath: string,
    private readonly cwd: string,
  ) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const fsPath = tryFsPath(doc.uri);
    if (!fsPath) return emptyCcResult();
    const byName = await radonCcForFile(doc.languageId, fsPath, this.cwd, this.pythonPath);
    return { byLine: new Map(), byName };
  }
}

/** PMD-backed CC provider for Java (CLI). */
export class CliPmdCcProvider implements CyclomaticComplexityProvider {
  constructor(
    private readonly pmdPath: string,
    private readonly cwd: string,
  ) {}

  async computeComplexity(doc: DocumentInfo): Promise<CcResult> {
    const fsPath = tryFsPath(doc.uri);
    if (!fsPath) return emptyCcResult();
    const byLine = await pmdCcForFile(doc.languageId, fsPath, this.cwd, this.pmdPath);
    return { byLine, byName: new Map() };
  }
}
