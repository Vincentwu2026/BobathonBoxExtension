import { z } from 'zod';
import { getDatabase, type SearchResultItem } from './schema.js';
import { BoxCrawler } from './crawler.js';
import { formatError, formatSuccess } from '../tools/box-file-tools.js';

export interface SearchQueryOptions {
  query: string;
  limit?: number;
  offset?: number;
  owner?: string;
  pathPrefix?: string;
}

export interface SearchResponse {
  query: string;
  totalFound: number;
  limit: number;
  offset: number;
  results: SearchResultItem[];
}

/**
 * Sanitizes and formats an input string for SQLite FTS5 queries.
 * Supports token prefixes (e.g. term*) while escaping special characters.
 */
export function sanitizeFtsQuery(rawQuery: string): string {
  const cleaned = rawQuery.trim().replace(/['"]/g, '');
  if (!cleaned) return '';

  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return '';

  // Form boolean match expression with prefix matching on tokens
  return tokens.map((token) => `"${token}"*`).join(' AND ');
}

/**
 * Performs full-text search against the local SQLite FTS5 index.
 */
export function searchLocalIndex(options: SearchQueryOptions): SearchResponse {
  const db = getDatabase();
  const limit = options.limit !== undefined ? options.limit : 20;
  const offset = options.offset !== undefined ? options.offset : 0;
  const ftsQuery = sanitizeFtsQuery(options.query);

  if (!ftsQuery) {
    return {
      query: options.query,
      totalFound: 0,
      limit,
      offset,
      results: [],
    };
  }

  try {
    let sql = `
      SELECT 
        f.box_id,
        f.name,
        f.path,
        f.owner_email,
        f.collaborators,
        f.content_preview,
        f.last_modified,
        f.indexed_at,
        fts.rank AS rank,
        snippet(files_fts, 5, '<mark>', '</mark>', '...', 16) AS snippet
      FROM files_fts AS fts
      JOIN files AS f ON f.rowid = fts.rowid
      WHERE files_fts MATCH ?
    `;

    const params: (string | number)[] = [ftsQuery];

    if (options.owner) {
      sql += ' AND f.owner_email LIKE ?';
      params.push(`%${options.owner}%`);
    }

    if (options.pathPrefix) {
      sql += ' AND f.path LIKE ?';
      params.push(`${options.pathPrefix}%`);
    }

    sql += ' ORDER BY fts.rank ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    const results: SearchResultItem[] = rows.map((row) => ({
      box_id: row.box_id,
      name: row.name,
      path: row.path,
      owner_email: row.owner_email,
      collaborators: row.collaborators,
      content_preview: row.content_preview,
      last_modified: row.last_modified,
      indexed_at: row.indexed_at,
      rank: row.rank,
      snippet: row.snippet || row.content_preview,
      url: `https://app.box.com/file/${row.box_id}`,
    }));

    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) AS total
      FROM files_fts AS fts
      JOIN files AS f ON f.rowid = fts.rowid
      WHERE files_fts MATCH ?
    `;
    const countParams: (string | number)[] = [ftsQuery];
    if (options.owner) {
      countSql += ' AND f.owner_email LIKE ?';
      countParams.push(`%${options.owner}%`);
    }
    if (options.pathPrefix) {
      countSql += ' AND f.path LIKE ?';
      countParams.push(`${options.pathPrefix}%`);
    }

    const countStmt = db.prepare(countSql);
    const countRow = countStmt.get(...countParams) as { total: number } | undefined;
    const totalFound = countRow?.total || results.length;

    return {
      query: options.query,
      totalFound,
      limit,
      offset,
      results,
    };
  } catch (err: any) {
    console.error(`[SearchIndex] Query failed: ${err?.message || err}`);
    return {
      query: options.query,
      totalFound: 0,
      limit,
      offset,
      results: [],
    };
  }
}

// ============================================================================
// MCP TOOL: index_crawl
// ============================================================================
export const indexCrawlSchema = {
  startFolderId: z.string().optional().default('0').describe('The Box Folder ID to start indexing from (default "0" for enterprise root)'),
  maxDepth: z.number().int().min(1).max(50).optional().default(10).describe('Maximum directory depth to crawl (default 10)'),
  forceReindex: z.boolean().optional().default(false).describe('If true, re-indexes files even if their modified timestamp has not changed'),
};

export async function handleIndexCrawl(args: z.infer<z.ZodObject<typeof indexCrawlSchema>>) {
  try {
    const crawler = new BoxCrawler();
    const stats = await crawler.crawl({
      startFolderId: args.startFolderId || '0',
      maxDepth: args.maxDepth,
      forceReindex: args.forceReindex,
    });

    return formatSuccess({
      success: true,
      message: `Crawl completed in ${stats.durationMs}ms`,
      stats: {
        startFolderId: stats.startFolderId,
        scannedFolders: stats.scannedFolders,
        indexedFiles: stats.indexedFiles,
        skippedFiles: stats.skippedFiles,
        errorCount: stats.errorCount,
        durationMs: stats.durationMs,
      },
      errors: stats.errors.length > 0 ? stats.errors.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    return formatError(`Index Crawl failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// MCP TOOL: index_search
// ============================================================================
export const indexSearchSchema = {
  query: z.string().describe('Full-text search query across file names, paths, descriptions, owner emails, and collaborators'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum results to return (default 20, max 100)'),
  offset: z.number().int().min(0).optional().default(0).describe('Pagination offset (default 0)'),
  owner: z.string().optional().describe('Optional filter by owner email or username substring'),
  pathPrefix: z.string().optional().describe('Optional filter by folder path prefix, e.g. "/Finance/"'),
};

export async function handleIndexSearch(args: z.infer<z.ZodObject<typeof indexSearchSchema>>) {
  try {
    const response = searchLocalIndex({
      query: args.query,
      limit: args.limit,
      offset: args.offset,
      owner: args.owner,
      pathPrefix: args.pathPrefix,
    });

    return formatSuccess(response);
  } catch (error: any) {
    return formatError(`Index Search failed: ${error?.message || String(error)}`);
  }
}
