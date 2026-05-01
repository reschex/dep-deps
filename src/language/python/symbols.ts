import { fileURLToPath } from 'node:url';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';
import { runPythonSymbolExtraction } from './symbolsSpawn';
import { parsePythonSymbolsJson } from './symbolsParse';

const DEFAULT_PYTHON = 'python3';
const TIMEOUT_MS = 10_000;

export class PythonSymbolProvider implements SymbolProvider {
  constructor(
    private readonly pythonPath: string = DEFAULT_PYTHON,
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {}

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    // The inline Python script opens the file by absolute path (sys.argv[1]),
    // so the subprocess cwd does not affect which file is read.
    const raw = await runPythonSymbolExtraction(
      this.pythonPath,
      filePath,
      '.',
      this.timeoutMs
    );
    return parsePythonSymbolsJson(raw);
  }
}
