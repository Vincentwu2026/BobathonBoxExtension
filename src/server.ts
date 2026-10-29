import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  boxGetFileSchema,
  boxGetFileVersionsSchema,
  boxListCollaboratorsSchema,
  boxListFolderSchema,
  boxMoveFileSchema,
  boxSearchSchema,
  boxUploadFileSchema,
  handleBoxGetFile,
  handleBoxGetFileVersions,
  handleBoxListCollaborators,
  handleBoxListFolder,
  handleBoxMoveFile,
  handleBoxSearch,
  handleBoxUploadFile,
} from './tools/box-file-tools.js';
import {
  handleIndexCrawl,
  handleIndexSearch,
  indexCrawlSchema,
  indexSearchSchema,
} from './indexer/search.js';
import {
  boxCheckRetentionSchema,
  boxGetRetentionLogsSchema,
  boxSafeDeleteSchema,
  boxSetRetentionPolicySchema,
  handleBoxCheckRetention,
  handleBoxGetRetentionLogs,
  handleBoxSafeDelete,
  handleBoxSetRetentionPolicy,
} from './tools/retention-tools.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'box-productivity-suite',
    version: '1.0.0',
  });

  // ==========================================================================
  // BOX CORE FILE TOOLS
  // ==========================================================================

  server.tool(
    'box_search',
    'Search Box enterprise content with filters for extension, folder scope, and object types.',
    boxSearchSchema,
    async (args) => handleBoxSearch(args)
  );

  server.tool(
    'box_get_file',
    'Retrieve rich metadata, hierarchy, and sharing details for a specific Box file by ID.',
    boxGetFileSchema,
    async (args) => handleBoxGetFile(args)
  );

  server.tool(
    'box_list_folder',
    'List items inside a Box folder with pagination and sorting options.',
    boxListFolderSchema,
    async (args) => handleBoxListFolder(args)
  );

  server.tool(
    'box_upload_file',
    'Upload a new file (UTF-8 text or Base64 binary) to a target Box folder.',
    boxUploadFileSchema,
    async (args) => handleBoxUploadFile(args)
  );

  server.tool(
    'box_move_file',
    'Move or rename a Box file to a designated destination folder.',
    boxMoveFileSchema,
    async (args) => handleBoxMoveFile(args)
  );

  server.tool(
    'box_list_collaborators',
    'List all active and pending collaborators and their permission roles on a Box file or folder.',
    boxListCollaboratorsSchema,
    async (args) => handleBoxListCollaborators(args)
  );

  server.tool(
    'box_get_file_versions',
    'Retrieve previous versions and revision history for a Box file.',
    boxGetFileVersionsSchema,
    async (args) => handleBoxGetFileVersions(args)
  );

  // ==========================================================================
  // LOCAL FTS5 INDEXING AGENT TOOLS
  // ==========================================================================

  server.tool(
    'index_crawl',
    'Trigger an incremental recursive crawl of the Box folder tree to populate the local SQLite FTS5 index.',
    indexCrawlSchema,
    async (args) => handleIndexCrawl(args)
  );

  server.tool(
    'index_search',
    'Execute sub-millisecond full-text searches over indexed Box files using SQLite FTS5 relevance ranking.',
    indexSearchSchema,
    async (args) => handleIndexSearch(args)
  );

  // ==========================================================================
  // RETENTION & DELETION-PROTECTION GUARD TOOLS
  // ==========================================================================

  server.tool(
    'box_check_retention',
    'Evaluate retention status for a Box file. Verifies active collaborators and do_not_delete metadata tags.',
    boxCheckRetentionSchema,
    async (args) => handleBoxCheckRetention(args)
  );

  server.tool(
    'box_safe_delete',
    'Safely delete a Box file ONLY if it has zero active collaborators and no do_not_delete tags. Raw delete is blocked.',
    boxSafeDeleteSchema,
    async (args) => handleBoxSafeDelete(args)
  );

  server.tool(
    'box_set_retention_policy',
    'Apply explicit retention tag (do_not_delete) and protection metadata to a Box file to prevent deletion.',
    boxSetRetentionPolicySchema,
    async (args) => handleBoxSetRetentionPolicy(args)
  );

  server.tool(
    'box_get_retention_logs',
    'Inspect audit trail of retention checks, blocked deletion attempts, policy changes, and permitted deletions.',
    boxGetRetentionLogsSchema,
    async (args) => handleBoxGetRetentionLogs(args)
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    console.error('[BoxProductivitySuite] Received SIGINT. Shutting down gracefully...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[BoxProductivitySuite] Received SIGTERM. Shutting down gracefully...');
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('[BoxProductivitySuite] MCP Server successfully initialized on stdio transport.');
}
