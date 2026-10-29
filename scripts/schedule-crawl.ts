#!/usr/bin/env node
/**
 * CLI Script: Schedule and run periodic crawls of Box enterprise directory into SQLite FTS5 index.
 * Can be run as a cron job, systemd service, or background daemon process.
 */

import { BoxCrawler } from '../src/indexer/crawler.js';

/** Returns false if the crawl could not run at all (e.g. missing credentials). */
async function executeCrawlOnce(): Promise<boolean> {
  const startFolderId = process.env.BOX_START_FOLDER_ID || '0';
  const maxDepth = Number.parseInt(process.env.BOX_CRAWL_MAX_DEPTH || '15', 10);
  const forceReindex = process.env.BOX_FORCE_REINDEX === 'true';

  console.error(`\n[ScheduleCrawl] === Starting Scheduled Crawl at ${new Date().toISOString()} ===`);
  const crawler = new BoxCrawler();

  try {
    const stats = await crawler.crawl({
      startFolderId,
      maxDepth,
      forceReindex,
      onProgress: (scanned, indexed, skipped) => {
        if ((scanned + indexed + skipped) % 50 === 0) {
          console.error(`[ScheduleCrawl] Progress: ${scanned} folders, ${indexed} indexed, ${skipped} skipped`);
        }
      },
    });

    console.error(`[ScheduleCrawl] === Crawl Finished in ${stats.durationMs}ms ===`);
    console.error(`[ScheduleCrawl] Scanned Folders: ${stats.scannedFolders}`);
    console.error(`[ScheduleCrawl] Indexed Files:  ${stats.indexedFiles}`);
    console.error(`[ScheduleCrawl] Skipped Files:  ${stats.skippedFiles}`);
    console.error(`[ScheduleCrawl] Error Count:    ${stats.errorCount}`);
    if (stats.errors.length > 0) {
      console.error('[ScheduleCrawl] Sample Errors:', stats.errors.slice(0, 5));
    }
    return true;
  } catch (error: any) {
    console.error(`[ScheduleCrawl] Critical error during crawl run: ${error?.message || error}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once') || process.env.CRAWL_ONCE === 'true';
  const intervalMinutes = Number.parseInt(process.env.CRAWL_INTERVAL_MINUTES || '60', 10);

  if (runOnce) {
    // Non-zero exit lets cron / CI see that the crawl did not run.
    process.exit((await executeCrawlOnce()) ? 0 : 1);
  }

  console.error(`[ScheduleCrawl] Daemon started. Running initial crawl, then scheduling every ${intervalMinutes} minutes.`);
  await executeCrawlOnce();

  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    await executeCrawlOnce();
  }, intervalMs);

  process.on('SIGINT', () => {
    console.error('[ScheduleCrawl] Received SIGINT. Exiting daemon...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.error('[ScheduleCrawl] Received SIGTERM. Exiting daemon...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[ScheduleCrawl] Fatal failure:', err);
  process.exit(1);
});
