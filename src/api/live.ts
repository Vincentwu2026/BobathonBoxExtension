/**
 * Live Box Mode data access for the web UI.
 *
 * Differences from src/retention/guard.ts (deliberate):
 *  - FAIL-CLOSED: if file details or collaborators cannot be read, retention is reported as
 *    'unknown' (treated as protected) instead of silently "unprotected".
 *  - The web UI never deletes from Box. Delete attempts are dry runs that only evaluate and log.
 *
 * Rules are otherwise the same as guard.ts: protected when there is at least one accepted/pending
 * collaborator, or a do_not_delete marker in tags, description or custom metadata.
 */

import { getBoxClient } from '../box-client.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';
import { RetentionLogger } from '../retention/logger.js';
import { ApiError, classifyBoxError } from './errors.js';
import type { CollaboratorDTO, DeleteAttemptDTO, DocumentDTO, FolderDTO } from './dto.js';
import { buildRetention, departmentFromPath, unverifiedRetention } from './retention-view.js';

const MAX_FILES_EVALUATED = 25;
const EVAL_CONCURRENCY = 5;
const ID_PATTERN = /^\d{1,20}$/;

export function assertBoxId(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new ApiError(400, 'BAD_REQUEST', `${label} must be numeric (up to 20 digits).`);
  }
  return value;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapCollaborators(entries: readonly any[] | undefined): CollaboratorDTO[] {
  const out: CollaboratorDTO[] = [];
  for (const c of entries ?? []) {
    const status = String(c?.status ?? 'accepted').toLowerCase();
    if (status !== 'accepted' && status !== 'pending') continue;
    const who = c?.accessibleBy;
    out.push({
      name: who?.name ?? null,
      email: who && 'login' in who && who.login ? String(who.login) : `group: ${who?.name ?? 'unknown'}`,
      role: c?.role ? String(c.role) : null,
      status,
    });
  }
  return out;
}

function pathOf(item: any): string {
  const parts: string[] = (item?.pathCollection?.entries ?? [])
    .map((p: any) => String(p?.name ?? ''))
    .filter((n: string) => n && n !== 'All Files');
  return `/${[...parts, String(item?.name ?? '')].join('/')}`;
}

/** Same marker rules as guard.ts, with metadata read best-effort exactly as guard.ts does. */
async function readFlags(client: any, fileId: string, file: any): Promise<string[]> {
  const flags: string[] = [];

  for (const tag of Array.isArray(file?.tags) ? file.tags : []) {
    const t = String(tag).toLowerCase();
    if (t === 'do_not_delete' || t === 'retention_protected') flags.push(`tag:${tag}`);
  }
  if (file?.description && /do_not_delete|\[protected\]/i.test(String(file.description))) {
    flags.push('description:do_not_delete');
  }

  try {
    const md: any = await withRateLimitRetry(() => client.fileMetadata.getFileMetadata(fileId), { maxRetries: 1 }, `web_md_${fileId}`);
    for (const entry of md?.entries ?? []) {
      const raw = entry?.rawData ?? entry;
      for (const [key, val] of Object.entries(raw ?? {})) {
        const k = key.toLowerCase();
        const v = String(val).toLowerCase();
        if (k === 'do_not_delete' || k === 'retention' || v === 'do_not_delete' || v === 'protected') {
          flags.push(`metadata:${key}`);
        }
      }
    }
  } catch {
    // Custom metadata is not available on every Box tier; same non-fatal handling as guard.ts.
  }

  return flags;
}

async function evaluateFile(fileId: string): Promise<DocumentDTO> {
  const client = await getBoxClient();

  const file: any = await withRateLimitRetry(
    () =>
      client.files.getFileById(fileId, {
        queryParams: { fields: ['id', 'name', 'tags', 'description', 'owned_by', 'modified_at', 'path_collection'] },
      }),
    {},
    `web_file_${fileId}`
  );

  const collabResp: any = await withRateLimitRetry(
    () => client.listCollaborations.getFileCollaborations(fileId),
    {},
    `web_collabs_${fileId}`
  );

  const collaborators = mapCollaborators(collabResp?.entries);
  const flags = await readFlags(client, fileId, file);
  const filePath = pathOf(file);

  return {
    id: String(file.id),
    name: String(file.name ?? fileId),
    path: filePath,
    department: departmentFromPath(filePath),
    owner: String(file.ownedBy?.login ?? file.ownedBy?.name ?? 'Unknown'),
    collaborators,
    modifiedAt: toIso(file.modifiedAt),
    preview: String(file.description ?? ''),
    relevance: null,
    retention: buildRetention(collaborators, flags),
    url: `https://app.box.com/file/${encodeURIComponent(String(file.id))}`,
  };
}

/** Evaluates a file, converting 403/404 on a single file into a fail-closed 'unknown' record. */
async function evaluateFileSafe(fileId: string, fallbackName: string): Promise<DocumentDTO> {
  try {
    return await evaluateFile(fileId);
  } catch (err) {
    const api = classifyBoxError(err);
    if (api.code === 'NOT_FOUND' || api.code === 'FORBIDDEN') {
      return {
        id: fileId,
        name: fallbackName,
        path: '',
        department: 'Unfiled',
        owner: 'Unknown',
        collaborators: [],
        modifiedAt: null,
        preview: '',
        relevance: null,
        retention: unverifiedRetention(),
        url: `https://app.box.com/file/${encodeURIComponent(fileId)}`,
      };
    }
    throw api;
  }
}

async function evaluateMany(items: Array<{ id: string; name: string }>): Promise<DocumentDTO[]> {
  const out: DocumentDTO[] = [];
  for (let i = 0; i < items.length; i += EVAL_CONCURRENCY) {
    const batch = items.slice(i, i + EVAL_CONCURRENCY);
    out.push(...(await Promise.all(batch.map((it) => evaluateFileSafe(it.id, it.name)))));
  }
  return out;
}

export async function getLiveFolder(folderIdRaw: string): Promise<FolderDTO> {
  const folderId = assertBoxId(folderIdRaw, 'Folder ID');
  try {
    const client = await getBoxClient();

    const folder: any = await withRateLimitRetry(
      () => client.folders.getFolderById(folderId, { queryParams: { fields: ['id', 'name', 'path_collection'] } }),
      {},
      `web_folder_${folderId}`
    );

    const items: any = await withRateLimitRetry(
      () =>
        client.folders.getFolderItems(folderId, {
          queryParams: { limit: 100, offset: 0, fields: ['id', 'type', 'name'] },
        }),
      {},
      `web_items_${folderId}`
    );

    const entries: any[] = items?.entries ?? [];
    const fileEntries = entries.filter((e) => e.type === 'file').map((e) => ({ id: String(e.id), name: String(e.name) }));
    const subfolders = entries.filter((e) => e.type === 'folder').map((e) => ({ id: String(e.id), name: String(e.name) }));

    let folderCollaborators: CollaboratorDTO[] = [];
    try {
      const fc: any = await withRateLimitRetry(
        () => client.listCollaborations.getFolderCollaborations(folderId),
        { maxRetries: 1 },
        `web_folder_collabs_${folderId}`
      );
      folderCollaborators = mapCollaborators(fc?.entries);
    } catch {
      // Folder-level sharing is informational; file-level retention is evaluated separately.
    }

    const files = await evaluateMany(fileEntries.slice(0, MAX_FILES_EVALUATED));

    return {
      id: String(folder.id),
      name: String(folder.name),
      path: pathOf(folder),
      fileCount: fileEntries.length,
      subfolders,
      files,
      folderCollaborators,
      truncated: fileEntries.length > MAX_FILES_EVALUATED || Number(items?.totalCount ?? 0) > entries.length,
    };
  } catch (err) {
    throw classifyBoxError(err);
  }
}

export async function getLiveDocument(fileIdRaw: string): Promise<DocumentDTO> {
  const fileId = assertBoxId(fileIdRaw, 'File ID');
  try {
    return await evaluateFile(fileId);
  } catch (err) {
    throw classifyBoxError(err);
  }
}

export async function searchLive(query: string, limit: number): Promise<DocumentDTO[]> {
  try {
    const client = await getBoxClient();
    const resp: any = await withRateLimitRetry(
      () => client.search.searchForContent({ query, limit: Math.min(limit, 10), type: 'file' } as any),
      {},
      'web_search'
    );
    const hits = (resp?.entries ?? []).map((e: any) => ({ id: String(e.id), name: String(e.name) }));
    return await evaluateMany(hits);
  } catch (err) {
    throw classifyBoxError(err);
  }
}

/** Dry run only: evaluates and writes an audit entry; never calls Box delete. */
export async function liveDeleteAttempt(fileIdRaw: string): Promise<DeleteAttemptDTO> {
  const document = await getLiveDocument(fileIdRaw);
  const blocked = document.retention.status !== 'unprotected';

  if (blocked) {
    RetentionLogger.log({
      fileId: document.id,
      decision: 'BLOCKED',
      reason: `Web UI delete attempt (dry run) blocked: ${document.retention.explanation}`,
      details: { fileName: document.name, dryRun: true, source: 'web-ui' },
    });
  } else {
    RetentionLogger.log({
      fileId: document.id,
      decision: 'CHECKED',
      reason: 'Web UI delete attempt (dry run): deletion would be allowed. Nothing was deleted.',
      details: { fileName: document.name, dryRun: true, outcome: 'allowed', source: 'web-ui' },
    });
  }

  return { outcome: blocked ? 'blocked' : 'allowed', dryRun: true, document };
}
