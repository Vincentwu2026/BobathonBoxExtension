/**
 * Wire types. These mirror src/api/dto.ts in the backend repo root.
 */

export type RetentionStatus = 'protected' | 'unprotected' | 'unknown';
export type RetentionReasonCode = 'ACTIVE_COLLABORATORS' | 'DO_NOT_DELETE' | 'UNVERIFIED';

export interface Collaborator {
  name: string | null;
  email: string;
  role: string | null;
  status: string | null;
}

export interface RetentionReason {
  code: RetentionReasonCode;
  message: string;
}

export interface Retention {
  status: RetentionStatus;
  reasons: RetentionReason[];
  collaboratorCount: number;
  hasDoNotDeleteFlag: boolean;
  explanation: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  path: string;
  department: string;
  owner: string;
  collaborators: Collaborator[];
  modifiedAt: string | null;
  preview: string;
  /** FTS5 snippet. The only markup is <mark>…</mark>; rendered safely, never as HTML. */
  snippet?: string;
  /** 0-100, or null when the source does not provide a score. */
  relevance: number | null;
  retention: Retention;
  /** Null for seeded demo records, which do not exist in Box. */
  url: string | null;
}

// ------------------------------------------------------------------------- previews
// Mirrors src/preview/types.ts. Every string is untrusted text extracted from a file:
// render it as text only, never as HTML.

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
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

export type Preview =
  | { kind: 'document'; format: 'boxnote' | 'docx' | 'text'; blocks: PreviewBlock[]; truncated: boolean }
  | { kind: 'presentation'; format: 'pptx'; slides: PreviewSlide[]; totalSlides: number; truncated: boolean }
  | { kind: 'spreadsheet'; format: 'xlsx'; sheets: PreviewSheet[]; totalSheets: number; truncated: boolean }
  | { kind: 'unavailable'; reason: string };

export interface PreviewResponse {
  documentId: string;
  fileName: string;
  preview: Preview;
}

export interface AskBobResponse {
  documentId: string;
  fileName: string;
  /** Bob's reply. Untrusted text: render as text only. */
  answer: string;
  documentShortened: boolean;
}
