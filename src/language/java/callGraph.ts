/**
 * JavaCallGraphProvider — adapts buildJavaCallEdges to the CallGraphProvider port.
 *
 * Discovers Java source files via NodeDocumentProvider, then delegates to
 * the pure call graph builder. Mirrors NodeCallGraphProvider's pattern for TypeScript.
 */

import type { CallGraphProvider } from '../../core/ports';
import type { CallEdge } from '../../core/rank';
import { NodeDocumentProvider } from '../../adapter/cli/nodeDocument';
import { detectLanguageId } from '../patterns';
import { buildJavaCallEdges } from './callGraphBuild';

export class JavaCallGraphProvider implements CallGraphProvider {
  constructor(private readonly rootPath: string) {}

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    const docProvider = new NodeDocumentProvider(this.rootPath);
    const fileUris = await docProvider.findSourceFiles(maxFiles, rootUri);
    const javaUris = fileUris.filter((u) => detectLanguageId(u) === 'java');
    if (javaUris.length === 0) return [];
    return buildJavaCallEdges(javaUris);
  }
}
