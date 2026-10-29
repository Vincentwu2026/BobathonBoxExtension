#!/usr/bin/env node
/**
 * Box Productivity Suite
 * Model Context Protocol (MCP) Server Entrypoint
 */

import { runServer } from './server.js';

runServer().catch((error) => {
  console.error('[BoxProductivitySuite] Fatal startup error:', error);
  process.exit(1);
});
