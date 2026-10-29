import { unzipSync } from 'fflate';
import { LIMITS, PreviewError } from './limits.js';

const decoder = new TextDecoder('utf-8');

/**
 * Reads selected entries from a zip (an Office file) without trusting its headers.
 *
 * The filter runs on the central directory BEFORE anything is inflated, so entries that are
 * unwanted, too large, or too numerous are rejected without decompression. fflate also stops
 * inflating at the declared size, so a header that understates the real size cannot be used to
 * exhaust memory. Entry names are only ever map keys: nothing here touches the file system.
 */
export function readZip(bytes: Uint8Array, wanted: (name: string) => boolean): Map<string, Uint8Array> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new PreviewError('This file is not a valid Office document.');
  }

  const parts = new Map<string, Uint8Array>();
  let entries = 0;
  let totalDeclared = 0;

  const result = unzipSync(bytes, {
    filter(file) {
      entries += 1;
      if (entries > LIMITS.maxZipEntries) throw new PreviewError('This file has too many parts to preview.');
      if (!wanted(file.name)) return false;
      if (file.originalSize > LIMITS.maxPartBytes) throw new PreviewError('This file is too large to preview.');
      totalDeclared += file.originalSize;
      if (totalDeclared > LIMITS.maxTotalInflatedBytes) throw new PreviewError('This file is too large to preview.');
      return true;
    },
  });

  for (const [name, data] of Object.entries(result)) parts.set(name, data);
  return parts;
}

export function decodeUtf8(data: Uint8Array): string {
  return decoder.decode(data);
}
