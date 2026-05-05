/**
 * NativeCallGraphProvider — multi-language call graph dispatch.
 *
 * Combines TypeScript and Java call graph providers, collecting edges
 * from both languages and merging them into a single result.
 *
 * Mirrors NativeSymbolProvider's dispatch pattern for symbol extraction.
 */

import type { CallGraphProvider } from '../core/ports';
import type { CallEdge } from '../core/rank';
import { NodeCallGraphProvider } from './typescript/callGraph';
import { JavaCallGraphProvider } from './java/callGraph';

export class NativeCallGraphProvider implements CallGraphProvider {
  private readonly ts: NodeCallGraphProvider;
  private readonly java: JavaCallGraphProvider;

  constructor(rootPath: string) {
    this.ts = new NodeCallGraphProvider(rootPath);
    this.java = new JavaCallGraphProvider(rootPath);
  }

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    const [tsEdges, javaEdges] = await Promise.all([
      this.ts.collectCallEdges(maxFiles, rootUri),
      this.java.collectCallEdges(maxFiles, rootUri),
    ]);

    return [...tsEdges, ...javaEdges];
  }
}
