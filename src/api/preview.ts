/**
 * File previews for the web UI.
 *
 *  - Demo Mode reads a file from the demo working copy (BOX_SAMPLE_DRIVE, default ./data/demo-workspace),
 *    matched by the file name stored in the seeded index.
 *  - Live Mode downloads the file from Box on demand, read-only and size-capped.
 *
 * Neither path writes anything, and neither ever deletes. Extraction itself lives in
 * src/preview and returns bounded, structured text.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BoxClient } from 'box-node-sdk';
import { getBoxClient } from '../box-client.js';
import { getFileRecord } from '../indexer/schema.js';
import { PREVIEW_LIMITS, detectFormat, extractPreview, unsupportedReason, type PreviewDTO, type PreviewResponse } from '../preview/index.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';
import { readCapped } from '../util/read-capped.js';
import { ApiError, classifyBoxError } from './errors.js';
import { assertBoxId } from './live.js';

const TOO_LARGE = 'This file is too large to preview. Open the file in Box to view it.';

export function sampleDriveDir(): string {
  return path.resolve(process.env.BOX_SAMPLE_DRIVE || path.join(process.cwd(), 'data', 'demo-workspace'));
}

function unavailable(documentId: string, fileName: string, reason: string): PreviewResponse {
  return { documentId, fileName, preview: { kind: 'unavailable', reason } };
}

/**
 * Reads one file from the sample drive. The name is only ever compared against the directory
 * listing (which holds bare file names), so it cannot be used to reach another path, and
 * symlinks are rejected because lstat does not follow them.
 */
function readSampleFile(name: string): { bytes: Uint8Array } | { reason: string } {
  const dir = sampleDriveDir();
  let listing: string[];
  try {
    listing = fs.readdirSync(dir);
  } catch {
    return { reason: 'The demo files folder was not found. Start the API from the project folder.' };
  }
  if (!listing.includes(name)) {
    return { reason: 'This seeded demo record is a catalogue entry only. There is no file behind it to preview.' };
  }
  const full = path.join(dir, name);
  const stat = fs.lstatSync(full);
  if (!stat.isFile()) return { reason: 'This item is not a regular file, so it cannot be previewed.' };
  if (stat.size > PREVIEW_LIMITS.maxFileBytes) return { reason: TOO_LARGE };
  return { bytes: fs.readFileSync(full) };
}

export function getDemoPreview(documentId: string): PreviewResponse {
  const record = getFileRecord(documentId);
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'File not found in the demo dataset.');

  if (!detectFormat(record.name)) return unavailable(documentId, record.name, unsupportedReason(record.name));

  const file = readSampleFile(record.name);
  if ('reason' in file) return unavailable(documentId, record.name, file.reason);
  return { documentId, fileName: record.name, preview: extractPreview(record.name, file.bytes) };
}

/** The client provider is injectable so this can be tested without a Box connection. */
export async function getLivePreview(
  fileIdRaw: string,
  clientProvider: () => Promise<BoxClient> = getBoxClient
): Promise<PreviewResponse> {
  const fileId = assertBoxId(fileIdRaw, 'File ID');
  try {
    const client = await clientProvider();
    const file: any = await withRateLimitRetry(
      () => client.files.getFileById(fileId, { queryParams: { fields: ['id', 'name', 'size'] } }),
      {},
      `web_preview_meta_${fileId}`
    );
    const name = String(file?.name ?? fileId);

    // Decide from the name and the reported size BEFORE downloading anything.
    if (!detectFormat(name)) return unavailable(fileId, name, unsupportedReason(name));
    if (Number(file?.size ?? 0) > PREVIEW_LIMITS.maxFileBytes) return unavailable(fileId, name, TOO_LARGE);

    const stream: any = await withRateLimitRetry(() => client.downloads.downloadFile(fileId), {}, `web_preview_download_${fileId}`);
    if (!stream) return unavailable(fileId, name, 'Box did not provide the file content for preview.');

    const bytes = await readCapped(stream, PREVIEW_LIMITS.maxFileBytes);
    if (!bytes) return unavailable(fileId, name, TOO_LARGE);

    const preview: PreviewDTO = extractPreview(name, bytes);
    return { documentId: fileId, fileName: name, preview };
  } catch (err) {
    throw classifyBoxError(err);
  }
}
