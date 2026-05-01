import { fileURLToPath } from 'node:url';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';
import { runPmdRaw } from './cc/pmdSpawn';
import { parsePmdSymbolsXml } from './symbolsParse';

const DEFAULT_PMD = 'pmd';
const TIMEOUT_MS = 30_000;

/**
 * Java symbol provider using PMD CyclomaticComplexity XML output.
 *
 * Reuses the same PMD invocation as the CC provider — the XML output
 * contains method, beginline, and endline attributes that provide
 * everything needed for FunctionSymbolInfo.
 *
 * **Limitation:** PMD only reports violations when a method has complexity
 * at or above the configured minimum threshold (default CC >= 2). Methods
 * with a single path (CC=1) may not appear and will be missed.
 */
export class JavaSymbolProvider implements SymbolProvider {
  constructor(
    private readonly pmdPath: string = DEFAULT_PMD,
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {}

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    // PMD is invoked with an absolute path (-d fileFsPath); cwd does not
    // affect which file is read, so use '.' as a stable sentinel.
    const rawXml = await runPmdRaw(this.pmdPath, filePath, '.', this.timeoutMs);
    return parsePmdSymbolsXml(rawXml);
  }
}
