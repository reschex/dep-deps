import type { SymbolProvider, FunctionSymbolInfo } from '../core/ports';
import { detectLanguageId } from './patterns';
import { NodeSymbolProvider } from './typescript/symbols';
import { PythonSymbolProvider } from './python/symbols';
import { JavaNativeSymbolProvider } from './java/nativeSymbols';

const TS_LANGUAGE_IDS = new Set([
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
]);

/**
 * Language-native symbol provider that dispatches to per-language extractors.
 *
 * Replaces VsCodeSymbolProvider (ADR-005): deterministic results regardless of
 * which VS Code extensions are installed. No IDE dependency.
 */
export class NativeSymbolProvider implements SymbolProvider {
  private readonly ts: NodeSymbolProvider;
  private readonly python: PythonSymbolProvider;
  private readonly java: JavaNativeSymbolProvider;

  constructor(config?: {
    pythonPath?: string;
    pmdPath?: string;
    pythonTimeoutMs?: number;
    javaTimeoutMs?: number;
  }) {
    this.ts = new NodeSymbolProvider();
    this.python = new PythonSymbolProvider(config?.pythonPath, config?.pythonTimeoutMs);
    this.java = new JavaNativeSymbolProvider();
  }

  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    const languageId = detectLanguageId(uri);
    if (TS_LANGUAGE_IDS.has(languageId)) {
      return this.ts.getFunctionSymbols(uri);
    }
    if (languageId === 'python') {
      return this.python.getFunctionSymbols(uri);
    }
    if (languageId === 'java') {
      return this.java.getFunctionSymbols(uri);
    }
    return [];
  }
}
