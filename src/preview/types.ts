/**
 * Wire format for file previews (mirrored by frontend/src/types).
 *
 * Previews are plain structured data: every string is untrusted text extracted from a user's
 * file and must be rendered as text, never as HTML.
 */

export type PreviewBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'preformatted'; text: string }
  | { type: 'list_item'; text: string; level: number; ordered: boolean }
  | { type: 'table'; rows: string[][] };

export interface PreviewSlide {
  index: number;
  title: string;
  blocks: PreviewBlock[];
  notes: string;
}

export interface PreviewSheet {
  name: string;
  /** Row i is spreadsheet row i + 1; empty rows are kept so numbering stays aligned. */
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

export type PreviewFormat = 'boxnote' | 'docx' | 'pptx' | 'xlsx' | 'text';

export type PreviewDTO =
  | { kind: 'document'; format: 'boxnote' | 'docx' | 'text'; blocks: PreviewBlock[]; truncated: boolean }
  | { kind: 'presentation'; format: 'pptx'; slides: PreviewSlide[]; totalSlides: number; truncated: boolean }
  | { kind: 'spreadsheet'; format: 'xlsx'; sheets: PreviewSheet[]; totalSheets: number; truncated: boolean }
  | { kind: 'unavailable'; reason: string };

export interface PreviewResponse {
  documentId: string;
  fileName: string;
  preview: PreviewDTO;
}
