/**
 * Wire format shared by the web UI API (and mirrored by frontend/src/types).
 */

export type RetentionStatus = 'protected' | 'unprotected' | 'unknown';
export type RetentionReasonCode = 'ACTIVE_COLLABORATORS' | 'DO_NOT_DELETE' | 'UNVERIFIED';

export interface CollaboratorDTO {
  name: string | null;
  email: string;
  role: string | null;
  status: string | null;
}

export interface RetentionReasonDTO {
  code: RetentionReasonCode;
  message: string;
}

export interface RetentionDTO {
  status: RetentionStatus;
  reasons: RetentionReasonDTO[];
  collaboratorCount: number;
  hasDoNotDeleteFlag: boolean;
  explanation: string;
}

export interface DocumentDTO {
  id: string;
  name: string;
  path: string;
  department: string;
  owner: string;
  collaborators: CollaboratorDTO[];
  modifiedAt: string | null;
  preview: string;
  /** FTS5 snippet; the only markup is <mark>…</mark>, rendered safely by the UI. */
  snippet?: string;
  /** 0-100, normalised against the best hit in the result set. Null when unavailable. */
  relevance: number | null;
  retention: RetentionDTO;
  /** Link into Box. Null for seeded demo records, which do not exist in Box. */
  url: string | null;
}

export interface FolderRefDTO {
  id: string;
  name: string;
}

export interface FolderDTO {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  subfolders: FolderRefDTO[];
  files: DocumentDTO[];
  folderCollaborators: CollaboratorDTO[];
  /** True when the folder holds more files than were evaluated. */
  truncated: boolean;
}

export type AuditResult = 'blocked' | 'allowed' | 'info';

export interface AuditEntryDTO {
  id: string;
  timestamp: string;
  fileId: string;
  fileName: string;
  action: string;
  result: AuditResult;
  reason: string;
}

export interface DeleteAttemptDTO {
  outcome: 'blocked' | 'allowed';
  /** Always true for live mode: the web UI never deletes anything from Box. */
  dryRun: true;
  document: DocumentDTO;
}

export type ComponentState = 'ok' | 'warn' | 'error';

export interface ComponentStatusDTO {
  key: string;
  label: string;
  state: ComponentState;
  headline: string;
  detail?: string;
}

export interface SystemStatusDTO {
  checkedAt: string;
  components: ComponentStatusDTO[];
}
