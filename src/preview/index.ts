/**
 * File preview extraction: Box Notes, Word, PowerPoint, Excel and plain text.
 *
 * Pure functions from bytes to a bounded, structured result. No network, no file system, no
 * HTML. Everything extracted is untrusted text for the UI to render as text.
 */

import { extractBoxNote, extractText } from './boxnote.js';
import { extractDocx } from './docx.js';
import { LIMITS, PreviewError } from './limits.js';
import type { PreviewDTO, PreviewFormat } from './types.js';
import { extractPptx } from './pptx.js';
import { extractXlsx } from './xlsx.js';

export type { PreviewDTO, PreviewResponse } from './types.js';

/** Flattens a preview to plain text, e.g. to make a file's content searchable. */
export function previewToPlainText(preview: PreviewDTO, maxChars = 4000): string {
  const out: string[] = [];
  const addBlocks = (blocks: Array<{ type: string; text?: string; rows?: string[][] }>) => {
    for (const b of blocks) out.push(b.type === 'table' ? (b.rows ?? []).map((r) => r.join(' ')).join('\n') : (b.text ?? ''));
  };
  if (preview.kind === 'document') addBlocks(preview.blocks);
  else if (preview.kind === 'presentation') {
    for (const s of preview.slides) {
      out.push(s.title);
      addBlocks(s.blocks);
      out.push(s.notes);
    }
  } else if (preview.kind === 'spreadsheet') {
    for (const s of preview.sheets) {
      out.push(s.name);
      out.push(s.rows.map((r) => r.join(' ')).join('\n'));
    }
  }
  return out.filter(Boolean).join('\n').replace(/[ \t]+/g, ' ').slice(0, maxChars);
}
export { PreviewError, LIMITS as PREVIEW_LIMITS } from './limits.js';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'sql', 'html', 'htm']);

export function detectFormat(fileName: string): PreviewFormat | null {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (ext === 'boxnote') return 'boxnote';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

/** Why a file type has no preview. Short, user-facing, and free of file content. */
export function unsupportedReason(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (ext === 'pdf') return 'PDF preview is not supported yet. Open the file in Box to view it.';
  if (['doc', 'ppt', 'xls'].includes(ext)) return `Legacy .${ext} files are not supported. Open the file in Box to view it.`;
  return 'No preview is available for this file type.';
}

/**
 * Extracts a preview. Never throws for bad input: unreadable or oversized files become an
 * 'unavailable' result with a safe reason, and details are logged server-side only.
 */
export function extractPreview(fileName: string, bytes: Uint8Array): PreviewDTO {
  const format = detectFormat(fileName);
  if (!format) return { kind: 'unavailable', reason: unsupportedReason(fileName) };
  if (bytes.length > LIMITS.maxFileBytes) {
    return { kind: 'unavailable', reason: 'This file is too large to preview. Open the file in Box to view it.' };
  }

  try {
    switch (format) {
      case 'boxnote':
        return extractBoxNote(bytes);
      case 'docx':
        return extractDocx(bytes);
      case 'pptx':
        return extractPptx(bytes);
      case 'xlsx':
        return extractXlsx(bytes);
      case 'text':
        return extractText(bytes);
    }
  } catch (err) {
    if (err instanceof PreviewError) return { kind: 'unavailable', reason: err.message };
    console.error(`[Preview] Extraction failed for a .${format} file: ${(err as Error)?.message ?? err}`);
    return { kind: 'unavailable', reason: 'This file could not be read for preview.' };
  }
}
