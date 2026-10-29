import type { BoxClient } from 'box-node-sdk';
import { getBoxClient } from '../box-client.js';
import { detectFormat, extractPreview, previewToPlainText } from '../preview/index.js';
import { isActiveCollaboratorStatus } from '../retention/rules.js';
import { boxDateToIso } from '../util/box-date.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';
import { readCapped } from '../util/read-capped.js';
import { getFileRecord, upsertFileRecord, type IndexedFileRecord } from './schema.js';

/** Largest file the crawler downloads to index its text. Larger files are indexed by metadata only. */
const MAX_INDEX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

export interface CrawlOptions {
  startFolderId?: string;
  maxDepth?: number;
  forceReindex?: boolean;
  /** Download supported files (Box Notes, Word, PowerPoint, Excel, text) and index their text. Default true. */
  indexContent?: boolean;
  onProgress?: (scanned: number, indexed: number, skipped: number) => void;
}

export interface CrawlStats {
  scannedFolders: number;
  indexedFiles: number;
  skippedFiles: number;
  errorCount: number;
  errors: string[];
  durationMs: number;
  startFolderId: string;
}

export class BoxCrawler {
  private scannedFolders = 0;
  private indexedFiles = 0;
  private skippedFiles = 0;
  private errors: string[] = [];
  private indexContent = true;

  /** The client provider is injectable so the crawler can be tested without a Box connection. */
  constructor(private readonly clientProvider: () => Promise<BoxClient> = getBoxClient) {}

  /**
   * Performs recursive traversal of the Box folder tree and updates the SQLite FTS5 index.
   */
  public async crawl(options: CrawlOptions = {}): Promise<CrawlStats> {
    const startTime = Date.now();
    const startFolderId = options.startFolderId || '0';
    const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 15;
    const forceReindex = Boolean(options.forceReindex);
    this.indexContent = options.indexContent ?? process.env.BOX_INDEX_CONTENT !== 'false';

    this.scannedFolders = 0;
    this.indexedFiles = 0;
    this.skippedFiles = 0;
    this.errors = [];

    console.error(`[BoxCrawler] Starting crawl from folder ID: ${startFolderId} (maxDepth: ${maxDepth}, forceReindex: ${forceReindex})`);

    const basePath = await this.resolveBasePath(startFolderId);
    await this.crawlFolder(startFolderId, basePath, 0, maxDepth, forceReindex, options.onProgress);

    const durationMs = Date.now() - startTime;
    console.error(
      `[BoxCrawler] Completed in ${durationMs}ms: ${this.scannedFolders} folders scanned, ${this.indexedFiles} files indexed, ${this.skippedFiles} files skipped, ${this.errors.length} errors.`
    );

    return {
      scannedFolders: this.scannedFolders,
      indexedFiles: this.indexedFiles,
      skippedFiles: this.skippedFiles,
      errorCount: this.errors.length,
      errors: this.errors,
      durationMs,
      startFolderId,
    };
  }

  /**
   * Paths are stored from the Box root, so a crawl that starts in a sub-folder still produces
   * paths like /Finance/2026/ and not /2026/. Falls back to '/' for the root or if unreadable.
   */
  private async resolveBasePath(startFolderId: string): Promise<string> {
    if (startFolderId === '0') return '/';
    try {
      const client = await this.clientProvider();
      const folder: any = await withRateLimitRetry(
        () => client.folders.getFolderById(startFolderId, { queryParams: { fields: ['id', 'name', 'path_collection'] } }),
        { maxRetries: 2 },
        `crawl_base_path_${startFolderId}`
      );
      const parents: string[] = (folder?.pathCollection?.entries ?? [])
        .map((p: any) => String(p?.name ?? ''))
        .filter((n: string) => n && n !== 'All Files');
      return `/${[...parents, String(folder?.name ?? '')].filter(Boolean).join('/')}/`;
    } catch (err: any) {
      console.error(`[BoxCrawler] Could not resolve path of folder ${startFolderId}; using relative paths: ${err?.message || err}`);
      return '/';
    }
  }

  private async crawlFolder(
    folderId: string,
    currentPath: string,
    depth: number,
    maxDepth: number,
    forceReindex: boolean,
    onProgress?: (scanned: number, indexed: number, skipped: number) => void
  ): Promise<void> {
    if (depth > maxDepth) {
      console.error(`[BoxCrawler] Reached maximum depth limit (${maxDepth}) at path: ${currentPath}`);
      return;
    }

    this.scannedFolders++;
    const client = await this.clientProvider();
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await withRateLimitRetry(
          () =>
            client.folders.getFolderItems(folderId, {
              queryParams: {
                limit,
                offset,
                fields: [
                  'id',
                  'type',
                  'name',
                  'size',
                  'modified_at',
                  'created_at',
                  'owned_by',
                  'description',
                  'path_collection',
                ],
              },
            }),
          {},
          `crawl_folder_${folderId}_offset_${offset}`
        );

        const entries = response.entries || [];
        if (entries.length === 0) {
          hasMore = false;
          break;
        }

        for (const entry of entries) {
          if (entry.type === 'folder') {
            const nextPath = `${currentPath}${entry.name}/`;
            await this.crawlFolder(entry.id, nextPath, depth + 1, maxDepth, forceReindex, onProgress);
          } else if (entry.type === 'file') {
            await this.processFile(entry, currentPath, forceReindex);
            if (onProgress) {
              onProgress(this.scannedFolders, this.indexedFiles, this.skippedFiles);
            }
          }
        }

        offset += entries.length;
        const totalCount = response.totalCount || 0;
        if (offset >= totalCount || entries.length < limit) {
          hasMore = false;
        }
      } catch (err: any) {
        const errorMsg = `Failed to process folder ${folderId} (${currentPath}): ${err?.message || err}`;
        console.error(`[BoxCrawler] ${errorMsg}`);
        this.errors.push(errorMsg);
        hasMore = false;
      }
    }
  }

  private async processFile(entry: any, folderPath: string, forceReindex: boolean): Promise<void> {
    try {
      const fileId = entry.id;
      // The SDK returns a { value: Date } wrapper; normalise to an ISO string for storage and comparison.
      const modifiedAt = boxDateToIso(entry.modifiedAt ?? entry.modified_at);
      const existing = getFileRecord(fileId);

      // Incremental check: Skip if modified_at has not changed and not forcing reindex
      if (!forceReindex && existing && existing.last_modified === modifiedAt && existing.last_modified !== '') {
        this.skippedFiles++;
        return;
      }

      // Fetch collaborators for the file
      let collaboratorsStr = '';
      try {
        const client = await this.clientProvider();
        const collabs = await withRateLimitRetry(
          () => client.listCollaborations.getFileCollaborations(fileId),
          { maxRetries: 2 },
          `get_collabs_${fileId}`
        );

        if (collabs.entries && collabs.entries.length > 0) {
          // Same definition of "active" as the retention guard: accepted or pending only.
          const names = collabs.entries
            .filter((c: any) => isActiveCollaboratorStatus(String(c.status ?? 'accepted')))
            .map((c: any) => c.accessibleBy?.login || c.accessibleBy?.name)
            .filter(Boolean);
          collaboratorsStr = names.join(', ');
        }
      } catch (collabErr) {
        // Non-fatal if collaboration read is restricted for individual file
      }

      const filePath = `${folderPath}${entry.name}`;
      const ownerEmail = entry.ownedBy?.login || entry.ownedBy?.name || '';
      // The Box description stays first, so markers like [protected] keep working; extracted text follows.
      const body = await this.fetchBodyText(fileId, entry);
      const contentPreview = [entry.description || '', body].filter(Boolean).join('\n');

      const record: IndexedFileRecord = {
        box_id: fileId,
        name: entry.name,
        path: filePath,
        owner_email: ownerEmail,
        collaborators: collaboratorsStr,
        content_preview: contentPreview,
        last_modified: modifiedAt,
        indexed_at: new Date().toISOString(),
      };

      upsertFileRecord(record);
      this.indexedFiles++;
    } catch (err: any) {
      const errorMsg = `Error indexing file ${entry.id} (${entry.name}): ${err?.message || err}`;
      console.error(`[BoxCrawler] ${errorMsg}`);
      this.errors.push(errorMsg);
    }
  }

  /**
   * Text of the file body for full-text search. Best effort: anything that cannot be downloaded
   * or read just means the file is indexed by metadata alone, and is never a crawl error.
   * The type and the reported size are checked before downloading, and the stream is capped.
   */
  private async fetchBodyText(fileId: string, entry: any): Promise<string> {
    const name = String(entry.name ?? '');
    if (!this.indexContent || !detectFormat(name)) return '';
    if (Number(entry.size ?? 0) > MAX_INDEX_DOWNLOAD_BYTES) return '';
    try {
      const client = await this.clientProvider();
      const stream: any = await withRateLimitRetry(() => client.downloads.downloadFile(fileId), { maxRetries: 2 }, `crawl_download_${fileId}`);
      if (!stream) return '';
      const bytes = await readCapped(stream, MAX_INDEX_DOWNLOAD_BYTES);
      if (!bytes) return '';
      return previewToPlainText(extractPreview(name, bytes));
    } catch (err: any) {
      console.error(`[BoxCrawler] Could not read content of file ${fileId}; indexing metadata only: ${err?.message || err}`);
      return '';
    }
  }
}
