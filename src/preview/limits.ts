import type { PreviewBlock } from './types.js';

/** Hard caps. Previews parse untrusted files, so every dimension is bounded. */
export const LIMITS = {
  /** Largest file that will be downloaded / read for a preview. */
  maxFileBytes: 25 * 1024 * 1024,
  /** Largest declared (uncompressed) size of any single zip entry we read. */
  maxPartBytes: 16 * 1024 * 1024,
  /** Largest total declared size of all zip entries read for one preview. */
  maxTotalInflatedBytes: 48 * 1024 * 1024,
  maxZipEntries: 5000,
  maxBlocks: 1500,
  maxTextChars: 200_000,
  maxCellChars: 500,
  maxNotesChars: 4000,
  maxSlides: 100,
  maxSheets: 10,
  maxRows: 100,
  maxCols: 30,
} as const;

/** A user-facing reason that is safe to show; never contains file content. */
export class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewError';
  }
}

// Control characters (except tab/newline) and bidirectional overrides, which can make
// extracted text render in a different order than it is stored ("Trojan Source" style).
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanText(text: string): string {
  return text.replace(UNSAFE_CHARS, '');
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One-line text: collapses whitespace, strips unsafe characters, bounds the length. */
export function cell(text: string): string {
  return clip(cleanText(text).replace(/\s+/g, ' ').trim(), LIMITS.maxCellChars);
}

/** Shared budget so a preview as a whole stays bounded however many blocks it is split into. */
export class Budget {
  blocks = 0;
  chars = 0;
  truncated = false;

  /** Reserves room for a block; returns false (and marks the preview truncated) when full. */
  reserve(size: number): boolean {
    if (this.truncated) return false;
    if (this.blocks >= LIMITS.maxBlocks || this.chars + size > LIMITS.maxTextChars) {
      this.truncated = true;
      return false;
    }
    this.blocks += 1;
    this.chars += size;
    return true;
  }
}

function blockSize(block: PreviewBlock): number {
  if (block.type === 'table') return block.rows.reduce((n, r) => n + r.reduce((m, c) => m + c.length, 0), 0);
  return block.text.length;
}

export class BlockSink {
  readonly blocks: PreviewBlock[] = [];

  constructor(private readonly budget: Budget) {}

  get full(): boolean {
    return this.budget.truncated;
  }

  add(block: PreviewBlock): boolean {
    if (block.type !== 'table' && block.text.length === 0) return true;
    if (!this.budget.reserve(blockSize(block))) return false;
    this.blocks.push(block);
    return true;
  }

  /** Adds a table, clamping its size. Clamping marks the whole preview as truncated. */
  addTable(rows: string[][]): boolean {
    let clamped = rows.length > LIMITS.maxRows;
    const limited = rows.slice(0, LIMITS.maxRows).map((r) => {
      if (r.length > LIMITS.maxCols) clamped = true;
      return r.slice(0, LIMITS.maxCols).map(cell);
    });
    if (limited.length === 0) return true;
    const ok = this.add({ type: 'table', rows: limited });
    if (clamped) this.budget.truncated = true;
    return ok;
  }
}
