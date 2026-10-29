import { getBoxClient } from '../box-client.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';
import { getFileRecord, upsertFileRecord, type IndexedFileRecord } from './schema.js';

export interface CrawlOptions {
  startFolderId?: string;
  maxDepth?: number;
  forceReindex?: boolean;
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

  /**
   * Performs recursive traversal of the Box folder tree and updates the SQLite FTS5 index.
   */
  public async crawl(options: CrawlOptions = {}): Promise<CrawlStats> {
    const startTime = Date.now();
    const startFolderId = options.startFolderId || '0';
    const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 15;
    const forceReindex = Boolean(options.forceReindex);

    this.scannedFolders = 0;
    this.indexedFiles = 0;
    this.skippedFiles = 0;
    this.errors = [];

    console.error(`[BoxCrawler] Starting crawl from folder ID: ${startFolderId} (maxDepth: ${maxDepth}, forceReindex: ${forceReindex})`);

    await this.crawlFolder(startFolderId, '/', 0, maxDepth, forceReindex, options.onProgress);

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
    const client = await getBoxClient();
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
      const modifiedAt = entry.modifiedAt || entry.modified_at || '';
      const existing = getFileRecord(fileId);

      // Incremental check: Skip if modified_at has not changed and not forcing reindex
      if (!forceReindex && existing && existing.last_modified === modifiedAt && existing.last_modified !== '') {
        this.skippedFiles++;
        return;
      }

      // Fetch collaborators for the file
      let collaboratorsStr = '';
      try {
        const client = await getBoxClient();
        const collabs = await withRateLimitRetry(
          () => client.listCollaborations.getFileCollaborations(fileId),
          { maxRetries: 2 },
          `get_collabs_${fileId}`
        );

        if (collabs.entries && collabs.entries.length > 0) {
          const names = collabs.entries
            .map((c: any) => c.accessibleBy?.login || c.accessibleBy?.name)
            .filter(Boolean);
          collaboratorsStr = names.join(', ');
        }
      } catch (collabErr) {
        // Non-fatal if collaboration read is restricted for individual file
      }

      const filePath = `${folderPath}${entry.name}`;
      const ownerEmail = entry.ownedBy?.login || entry.ownedBy?.name || '';
      const contentPreview = entry.description || '';

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
}
