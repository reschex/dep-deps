/**
 * NodeCallGraphProvider — adapts buildTypeScriptCallEdges to the CallGraphProvider port.
 *
 * Discovers TS/JS source files via NodeDocumentProvider, then delegates to
 * the pure call graph builder. Python and Java files are excluded (R=1 until Phase 3).
 */

import type { CallGraphProvider } from '../../core/ports';
import type { CallEdge } from '../../core/rank';
import { NodeDocumentProvider } from '../../adapter/cli/nodeDocument';
import { buildTypeScriptCallEdges } from './callGraphBuild';
import { detectLanguageId } from '../patterns';

/** Language IDs eligible for TypeScript Compiler API call graph analysis. */
const TS_JS_LANGUAGE_IDS = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact']);

export class NodeCallGraphProvider implements CallGraphProvider {
  constructor(private readonly rootPath: string) {}

  async collectCallEdges(maxFiles: number, rootUri?: string): Promise<CallEdge[]> {
    const docProvider = new NodeDocumentProvider(this.rootPath);
    const fileUris = await docProvider.findSourceFiles(maxFiles, rootUri);
    // Filter to TS/JS only — other languages use null provider for now
    const tsUris = fileUris.filter((u) => TS_JS_LANGUAGE_IDS.has(detectLanguageId(u)));
    return buildTypeScriptCallEdges(this.rootPath, tsUris);
  }
}
