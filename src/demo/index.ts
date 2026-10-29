#!/usr/bin/env node
/**
 * DEMO ONLY: standalone MCP server exposing demo_retention_check.
 * Separate from the production server (src/index.ts) so production tool
 * registration and code paths are unchanged.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { closeDatabase } from '../indexer/schema.js';
import { demoRetentionCheckSchema, handleDemoRetentionCheck } from './demo-retention.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'box-productivity-suite-demo',
    version: '1.0.0',
  });

  server.tool(
    'demo_retention_check',
    'DEMO ONLY. Check deletion protection for a file in the seeded demo dataset: lists active collaborators, whether the file is protected, and why deletion would be blocked. Reads the local index; makes no Box API calls and deletes nothing.',
    demoRetentionCheckSchema,
    async (args) => handleDemoRetentionCheck(args)
  );

  const shutdown = async () => {
    await server.close();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(new StdioServerTransport());
  console.error('[BoxProductivitySuiteDemo] Demo MCP server initialized on stdio transport.');
}

main().catch((error) => {
  console.error('[BoxProductivitySuiteDemo] Fatal startup error:', error);
  process.exit(1);
});
