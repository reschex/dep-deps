/**
 * MCP server entry point — stdio transport.
 *
 * Usage: node out/adapter/mcp/bin.js
 *
 * Thin process shim. All logic lives in `runMcpServer`; this file only
 * supplies the working directory and reports fatal errors to stderr.
 */

import { runMcpServer, formatMcpError } from './runMcpServer';

runMcpServer({ rootPath: process.cwd() }).catch((err: unknown) => {
  process.stderr.write(`DDP MCP server error: ${formatMcpError(err)}\n`);
  process.exit(1);
});
