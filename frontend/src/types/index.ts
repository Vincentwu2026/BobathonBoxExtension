/**
 * Wire types. These mirror src/api/dto.ts in the backend repo root.
 */

export type Mode = 'demo' | 'live';

/** Where a result came from: the backend API, or the seeded copy bundled in the app. */
export type DataSource = 'api' | 'bundled';

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

export interface FolderRef {
  id: string;
  name: string;
}

export interface FolderView {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  subfolders: FolderRef[];
  files: DocumentItem[];
  folderCollaborators: Collaborator[];
  truncated: boolean;
}

export type AuditResult = 'blocked' | 'allowed' | 'info';
export type AuditFilter = 'all' | 'blocked' | 'allowed';

export interface AuditEntry {
  id: string;
  timestamp: string;
  fileId: string;
  fileName: string;
  action: string;
  result: AuditResult;
  reason: string;
}

export interface DeleteAttempt {
  outcome: 'blocked' | 'allowed';
  dryRun: true;
  document: DocumentItem;
}

export type ComponentState = 'ok' | 'warn' | 'error';

export interface ComponentStatus {
  key: string;
  label: string;
  state: ComponentState;
  headline: string;
  detail?: string;
}

export interface SystemStatus {
  checkedAt: string;
  components: ComponentStatus[];
}

export const LIVE_UNAVAILABLE_MESSAGE = 'Live Box connection unavailable.\nPlease switch to Demo Mode.';
