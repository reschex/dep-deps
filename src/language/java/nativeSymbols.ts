/**
 * JavaNativeSymbolProvider — extracts Java method symbols without PMD.
 *
 * Parses Java source directly using callGraphParse.ts to find ALL method
 * declarations, including CC=1 methods that PMD's CyclomaticComplexity
 * rule would miss.
 *
 * Symbol format matches JavaSymbolProvider (PMD): selectionStartLine = bodyStartLine,
 * selectionStartCharacter = 0. This ensures symbol IDs (uri#line:0) are identical
 * regardless of which provider extracted them.
 *
 * CC values are NOT computed here — that's handled by PmdCcProvider (via CcProviderRegistry)
 * or the regex fallback estimator in the orchestrator.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { SymbolProvider, FunctionSymbolInfo } from '../../core/ports';
import { parseJavaSource } from './callGraphParse';

export class JavaNativeSymbolProvider implements SymbolProvider {
  async getFunctionSymbols(uri: string): Promise<FunctionSymbolInfo[]> {
    try {
      const filePath = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
      const source = await readFile(filePath, 'utf-8');
      const info = parseJavaSource(source);

      return info.methods.map((method) => ({
        name: method.name,
        selectionStartLine: method.line,
        selectionStartCharacter: 0,
        bodyStartLine: method.line,
        bodyEndLine: method.endLine,
      }));
    } catch {
      return [];
    }
  }
}
