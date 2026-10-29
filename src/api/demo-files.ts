/**
 * Managing the demo files from the website: upload, change who has access, delete.
 *
 * Everything here works on the local demo working copy (BOX_SAMPLE_DRIVE, default ./data/demo-workspace)
 * and the local SQLite index. It never calls Box, and it never touches the bundled ./demo-files originals.
 * All mutations are synchronous after the request body has been read, so two requests cannot interleave
 * between "check" and "write".
 *
 * Safety rules:
 *  - An upload can never replace an existing file (that would sidestep the delete protection), and the
 *    name is a plain allow-listed file name: no folders, no hidden files, never governance.json.
 *  - A file must be a supported type, within the size cap, and actually readable as that type.
 *  - Delete is decided on the server by the same retention rules as everywhere else: a file with
 *    collaborators or a do-not-delete flag is refused. The way to delete it is to change its permissions
 *    first, which is recorded in the audit log, as is every delete.
 */

import fs from 'node:fs';
import path from 'node:path';
import { deleteFileRecord, getFileRecord } from '../indexer/schema.js';
import { evaluateDemoRetention } from '../demo/demo-retention.js';
import { DEFAULT_OWNER, EMAIL, GOVERNANCE_FILE, indexSampleFile, isDemoId, listSampleFiles, loadGovernance, saveGovernance, type Governance } from '../demo/seed-files.js';
import { detectFormat, extractPreview, PREVIEW_LIMITS } from '../preview/index.js';
import { appendDemoAudit } from './audit.js';
import { getDemoDocument } from './demo.js';
import type { DocumentDTO } from './dto.js';
import { ApiError } from './errors.js';
import { sampleDriveDir } from './preview.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DEMO_FILES = 50;
const MAX_NAME_CHARS = 120;
const MAX_EMAIL_CHARS = 254;
const MAX_COLLABORATORS = 20;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()\-]*$/;

export const SUPPORTED_TYPES_HINT = 'Word (.docx), PowerPoint (.pptx), Excel (.xlsx), Box Note (.boxnote) or a text file (.txt, .md, .csv, …)';

/** Returns the file name if it is safe to store, otherwise throws a 400 that says what to fix. */
export function validateUploadName(raw: string): string {
  const name = raw.normalize('NFC');
  if (name.length === 0 || name.length > MAX_NAME_CHARS) {
    throw new ApiError(400, 'BAD_REQUEST', `The file name must be 1-${MAX_NAME_CHARS} characters.`);
  }
  if (!NAME_PATTERN.test(name) || name.includes('..') || path.basename(name) !== name || name.endsWith('.') || name.endsWith(' ')) {
    throw new ApiError(400, 'BAD_REQUEST', 'Use only letters, numbers, spaces and - _ . ( ) in the file name, and rename the file if it does not.');
  }
  if (name.toLowerCase() === GOVERNANCE_FILE) {
    throw new ApiError(400, 'BAD_REQUEST', 'That file name is reserved. Please rename the file.');
  }
  if (!detectFormat(name)) {
    throw new ApiError(400, 'UNSUPPORTED_TYPE', `This type of file is not supported. Upload a ${SUPPORTED_TYPES_HINT}.`);
  }
  return name;
}

function assertWorkspace(dir: string): void {
  if (!fs.existsSync(dir)) throw new ApiError(503, 'NO_WORKSPACE', 'The demo files folder is missing. Restart the server from the project folder.');
}

function requireRecord(id: string) {
  const record = isDemoId(id) ? getFileRecord(id) : null;
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
  return record;
}

function documentOrThrow(id: string): DocumentDTO {
  const doc = getDemoDocument(id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
  return doc;
}

function log(decision: 'DELETED' | 'BLOCKED' | 'POLICY_SET', fileId: string, fileName: string, reason: string, extra: Record<string, unknown> = {}): void {
  appendDemoAudit({ timestamp: new Date().toISOString(), fileId, decision, reason, details: { fileName, demo: true, ...extra } });
}

export function addDemoFile(rawName: string, bytes: Uint8Array, dir: string = sampleDriveDir()): DocumentDTO {
  const name = validateUploadName(rawName);
  if (bytes.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'That file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ApiError(413, 'TOO_LARGE', `That file is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  if (bytes.length > PREVIEW_LIMITS.maxFileBytes) throw new ApiError(413, 'TOO_LARGE', 'That file is too large.');
  assertWorkspace(dir);

  const existing = listSampleFiles(dir);
  if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) {
    throw new ApiError(409, 'EXISTS', 'A file with this name already exists. Rename yours, or delete the old one first.');
  }
  if (existing.length >= MAX_DEMO_FILES) {
    throw new ApiError(409, 'LIMIT', `There are already ${MAX_DEMO_FILES} files. Delete one before adding another.`);
  }

  // Must really be a file of the type its name claims, not just any bytes with the right ending.
  const unreadable = new ApiError(422, 'UNREADABLE', 'That file could not be read as its type. Check that it is not damaged or password protected.');
  const format = detectFormat(name);
  if (format === 'docx' || format === 'pptx' || format === 'xlsx') {
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) throw unreadable;
  }
  if (format === 'text' && bytes.subarray(0, 8192).includes(0)) throw unreadable;
  if (extractPreview(name, bytes).kind === 'unavailable') throw unreadable;

  const target = path.join(dir, name);
  try {
    // 'wx' fails if anything (even a symlink) already exists at that path, so nothing is ever overwritten.
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  } catch {
    throw new ApiError(409, 'EXISTS', 'A file with this name already exists. Rename yours, or delete the old one first.');
  }

  try {
    const governance = loadGovernance(dir);
    governance[name] = { owner: DEFAULT_OWNER, collaborators: [], doNotDelete: false };
    saveGovernance(dir, governance);
    const id = indexSampleFile(dir, name, governance[name]);
    return documentOrThrow(id);
  } catch (err) {
    fs.rmSync(target, { force: true });
    console.error('[DemoFiles] Upload failed after the file was written; removed it:', err instanceof Error ? err.message : 'unknown error');
    throw err instanceof ApiError ? err : new ApiError(500, 'INTERNAL', 'Unexpected server error.');
  }
}

interface PermissionsInput {
  owner?: unknown;
  collaborators?: unknown;
  doNotDelete?: unknown;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email.length > 0 && email.length <= MAX_EMAIL_CHARS && EMAIL.test(email) ? email : null;
}

export function setDemoPermissions(id: string, input: PermissionsInput, dir: string = sampleDriveDir()): DocumentDTO {
  const record = requireRecord(id);
  assertWorkspace(dir);

  if (typeof input.doNotDelete !== 'boolean') throw new ApiError(400, 'BAD_REQUEST', 'doNotDelete must be true or false.');
  if (!Array.isArray(input.collaborators) || input.collaborators.length > MAX_COLLABORATORS) {
    throw new ApiError(400, 'BAD_REQUEST', `Give a list of up to ${MAX_COLLABORATORS} email addresses.`);
  }
  const collaborators: string[] = [];
  for (const raw of input.collaborators) {
    const email = cleanEmail(raw);
    if (!email) throw new ApiError(400, 'BAD_REQUEST', 'Enter valid email addresses, for example name@company.com.');
    if (!collaborators.some((c) => c.toLowerCase() === email.toLowerCase())) collaborators.push(email);
  }
  let owner = record.owner_email || DEFAULT_OWNER;
  if (input.owner !== undefined) {
    const email = cleanEmail(input.owner);
    if (!email) throw new ApiError(400, 'BAD_REQUEST', 'Enter a valid owner email address, for example name@company.com.');
    owner = email;
  }

  const before = evaluateDemoRetention(id);
  const next: Governance = { owner, collaborators, doNotDelete: input.doNotDelete };
  const governance = loadGovernance(dir);
  governance[record.name] = next;
  saveGovernance(dir, governance); // the file on disk is the source of truth; the index is rebuilt from it
  indexSampleFile(dir, record.name, next, id);

  const after = evaluateDemoRetention(id);
  log('POLICY_SET', id, record.name, `Permissions changed. Now: ${after?.explanation ?? 'unknown'}`, {
    owner,
    collaboratorCount: collaborators.length,
    doNotDelete: input.doNotDelete,
    wasProtected: before?.protected ?? null,
    isProtected: after?.protected ?? null,
  });
  return documentOrThrow(id);
}

export interface DeleteResult {
  id: string;
  name: string;
}

export function deleteDemoFile(id: string, dir: string = sampleDriveDir()): DeleteResult {
  const record = requireRecord(id);
  assertWorkspace(dir);

  // The decision is made here, from the stored record, never from anything the browser says.
  const verdict = evaluateDemoRetention(id);
  if (!verdict || verdict.protected) {
    const why = verdict?.explanation ?? 'The protection status could not be checked.';
    log('BLOCKED', id, record.name, `Delete attempt blocked: ${why}`);
    throw new ApiError(409, 'PROTECTED', `This file is protected and cannot be deleted. ${why} Change its permissions first.`);
  }

  const target = path.join(dir, record.name);
  try {
    const stat = fs.lstatSync(target);
    if (stat.isFile()) fs.unlinkSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[DemoFiles] Could not delete the file:', (err as NodeJS.ErrnoException)?.code ?? 'error');
      throw new ApiError(500, 'INTERNAL', 'Unexpected server error.');
    }
  }
  const governance = loadGovernance(dir);
  delete governance[record.name];
  saveGovernance(dir, governance);
  deleteFileRecord(id);

  log('DELETED', id, record.name, 'File deleted from the demo files. It had no collaborators and no do-not-delete flag.', { outcome: 'allowed' });
  return { id, name: record.name };
}
