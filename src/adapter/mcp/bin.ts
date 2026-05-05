/**
 * MCP server entry point — stdio transport.
 *
 * Usage: node out/adapter/mcp/bin.js
 *
 * This file has zero branching logic — all behaviour lives in index.ts.
 * No unit test needed (same rationale as src/adapter/cli/bin.ts).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './index';
import { runCliAnalysis } from '../cli/cliAnalysis';

const rootPath = process.cwd();

const server = createMcpServer({
  runAnalysis: (options) => runCliAnalysis({ ...options, rootPath }),
  rootPath,
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  process.stderr.write(`DDP MCP server error: ${err}\n`);
  process.exit(1);
});
