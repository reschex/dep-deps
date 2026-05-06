/**
 * MCP server entry-point orchestration.
 *
 * Extracted from `bin.ts` so the wiring (load `.ddprc.json` → convert to
 * analysis options → register tools) is independently testable. `bin.ts`
 * becomes a thin process shim that calls `runMcpServer` and reports errors.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './index';
import { runCliAnalysis } from '../cli/cliAnalysis';
import { loadDdpConfig } from '../../core/config';
import { configToAnalysisOptions } from '../cli/resolveOptions';

export type RunMcpServerOptions = {
  readonly rootPath: string;
};

/**
 * Boot the MCP server: load `.ddprc.json` from `rootPath`, build base
 * analysis options, and connect a stdio transport.
 *
 * Tool requests pass `{ rootPath }` only; we pre-fold all file-config-derived
 * fields into `baseOptions` and let the request `rootPath` win on conflict
 * (so a tool may scope analysis to a subdirectory in future).
 */
export async function runMcpServer(options: RunMcpServerOptions): Promise<void> {
  const { rootPath } = options;

  const warnFn = (msg: string) => process.stderr.write(`[WARN] ${msg}\n`);
  const config = await loadDdpConfig(rootPath, warnFn);

  // Strip rootPath from baseOptions so request rootPath always wins after spread,
  // even when a tool one day passes a different value than the boot rootPath.
  const { rootPath: _rootPath, ...baseOptions } = configToAnalysisOptions(config, rootPath);

  const server = createMcpServer({
    runAnalysis: (requestOptions) => runCliAnalysis({ ...baseOptions, ...requestOptions }),
    rootPath,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Format an unknown thrown value for stderr logging. Preserves stack
 * traces from `Error` instances (helps post-mortem debugging) while
 * remaining safe for any thrown value.
 */
export function formatMcpError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}
