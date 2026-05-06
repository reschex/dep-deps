/**
 * Tests for CLI-side CC provider adapters.
 *
 * These mirror the VS Code-side providers in `adapter/vscode/adapters.ts`
 * but resolve `fsPath` from a `file://` URI without depending on `vscode.Uri`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DocumentInfo } from '../../core/ports';

vi.mock('../../language/typescript/cc/eslintComplexity', () => ({
  eslintCcForFile: vi.fn(async () => new Map<number, number>([[3, 4]])),
}));
vi.mock('../../language/python/cc/radonCc', () => ({
  radonCcForFile: vi.fn(async () => new Map<string, number>([['foo', 5]])),
}));
vi.mock('../../language/java/cc/pmdComplexity', () => ({
  pmdCcForFile: vi.fn(async () => new Map<number, number>([[7, 8]])),
}));

import { eslintCcForFile } from '../../language/typescript/cc/eslintComplexity';
import { radonCcForFile } from '../../language/python/cc/radonCc';
import { pmdCcForFile } from '../../language/java/cc/pmdComplexity';
import {
  CliEslintCcProvider,
  CliRadonCcProvider,
  CliPmdCcProvider,
} from './cliCcProviders';

const ROOT_PATH = process.platform === 'win32' ? 'C:\\proj' : '/proj';
const SOURCE_FS_PATH = process.platform === 'win32' ? 'C:\\proj\\src\\f.ts' : '/proj/src/f.ts';
const SOURCE_URI = pathToFileURL(SOURCE_FS_PATH).toString();

function makeDoc(uri: string, languageId: string): DocumentInfo {
  return { uri, languageId, getText: () => '' };
}

describe('CliEslintCcProvider', () => {
  beforeEach(() => vi.mocked(eslintCcForFile).mockClear());

  it('passes resolved fsPath, cwd, and eslintPath to eslintCcForFile', async () => {
    const provider = new CliEslintCcProvider('eslint-bin', ROOT_PATH);
    const result = await provider.computeComplexity(makeDoc(SOURCE_URI, 'typescript'));

    expect(eslintCcForFile).toHaveBeenCalledWith('typescript', SOURCE_FS_PATH, ROOT_PATH, 'eslint-bin');
    expect(result.byLine.get(3)).toBe(4);
    expect(result.byName.size).toBe(0);
  });

  it('returns empty CcResult for non-file URIs without invoking eslint', async () => {
    const provider = new CliEslintCcProvider('eslint-bin', ROOT_PATH);
    const result = await provider.computeComplexity(makeDoc('untitled:foo.ts', 'typescript'));

    expect(eslintCcForFile).not.toHaveBeenCalled();
    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
  });
});

describe('CliRadonCcProvider', () => {
  beforeEach(() => vi.mocked(radonCcForFile).mockClear());

  it('passes resolved fsPath and pythonPath; returns byName map', async () => {
    const provider = new CliRadonCcProvider('python3.12', ROOT_PATH);
    const pyFsPath = process.platform === 'win32' ? 'C:\\proj\\src\\m.py' : '/proj/src/m.py';
    const pyUri = pathToFileURL(pyFsPath).toString();

    const result = await provider.computeComplexity(makeDoc(pyUri, 'python'));

    expect(radonCcForFile).toHaveBeenCalledWith('python', pyFsPath, ROOT_PATH, 'python3.12');
    expect(result.byName.get('foo')).toBe(5);
    expect(result.byLine.size).toBe(0);
  });

  it('returns empty CcResult for non-file URIs without invoking radon', async () => {
    const provider = new CliRadonCcProvider('python', ROOT_PATH);
    const result = await provider.computeComplexity(makeDoc('inmemory:m.py', 'python'));

    expect(radonCcForFile).not.toHaveBeenCalled();
    expect(result.byLine.size).toBe(0);
    expect(result.byName.size).toBe(0);
  });
});

describe('CliPmdCcProvider', () => {
  beforeEach(() => vi.mocked(pmdCcForFile).mockClear());

  it('passes resolved fsPath and pmdPath to pmdCcForFile', async () => {
    const provider = new CliPmdCcProvider('/opt/pmd', ROOT_PATH);
    const javaFsPath = process.platform === 'win32' ? 'C:\\proj\\src\\F.java' : '/proj/src/F.java';
    const javaUri = pathToFileURL(javaFsPath).toString();

    const result = await provider.computeComplexity(makeDoc(javaUri, 'java'));

    expect(pmdCcForFile).toHaveBeenCalledWith('java', javaFsPath, ROOT_PATH, '/opt/pmd');
    expect(result.byLine.get(7)).toBe(8);
  });

  it('returns empty CcResult for non-file URIs without invoking pmd', async () => {
    const provider = new CliPmdCcProvider('pmd', ROOT_PATH);
    const result = await provider.computeComplexity(makeDoc('jar:foo.jar!/F.java', 'java'));

    expect(pmdCcForFile).not.toHaveBeenCalled();
    expect(result.byLine.size).toBe(0);
  });
});

describe('CLI CC provider URI handling', () => {
  it('uses fileURLToPath round-trip identical to direct conversion', () => {
    // Sanity: the providers rely on the same conversion the test setup uses.
    // If this assumption breaks, the other tests would silently miss their
    // intended path comparison.
    expect(fileURLToPath(SOURCE_URI)).toBe(SOURCE_FS_PATH);
  });
});
