/**
 * Loads a folder of real files into the local index as Demo Mode records, so they can be searched
 * and previewed without any Box connection. Used by `npm run seed-sample-drive` and by the API on
 * start-up, and its building blocks are used when a user uploads a file or changes its permissions.
 *
 * Each file's text is extracted with the same code the preview uses and stored as the searchable
 * content, so a search for a word INSIDE a document finds it.
 *
 * <folder>/governance.json supplies what a download cannot carry:
 *   { "Report.docx": { "owner": "a@x.com", "collaborators": ["b@x.com"], "doNotDelete": true } }
 * Without an entry, a file gets the current user as owner and no collaborators.
 *
 * Records use IDs 9000000101+ (the demo prefix). A file keeps its ID across re-seeds (matched by name),
 * so an open pop-up never points at a different file after an upload or delete. Other demo records
 * (files no longer in the folder, the older bundled dataset) are removed from the local index.
 * This only touches the local SQLite index: never Box.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDatabase, upsertFileRecord } from '../indexer/schema.js';
import { PREVIEW_LIMITS, detectFormat, extractPreview, previewToPlainText } from '../preview/index.js';

export interface Governance {
  owner?: string;
  collaborators?: string[];
  doNotDelete?: boolean;
}

export const DEFAULT_OWNER = 'you@sample.local';
export const GOVERNANCE_FILE = 'governance.json';
export const EMAIL = /^[^\s@,;]+@[^\s@,;]+$/;

const FIRST_ID = 9000000101;
// Every ID in this range belongs to Demo Mode and is replaced on each seed (this also clears the
// older bundled demo dataset, which used 9000000001+).
const DEMO_RANGE_START = 9000000001;
const DEMO_RANGE_END = 9000001000;
// The retention rules treat these words anywhere in a record as "protected". A file's own text must not be
// able to switch that on (the user could never switch it off), so they are removed from the indexed text.
const PROTECTED_WORDS = /do_not_delete|\[protected\]/gi;

export function demoPath(name: string): string {
  return `/Demo Files/${name}`;
}

export function loadGovernance(dir: string): Record<string, Governance> {
  const file = path.join(dir, GOVERNANCE_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error('[SeedSample] governance.json is not valid JSON; ignoring it.');
    return {};
  }
}

/** Writes via a temporary file and a rename, so a crash never leaves a half-written governance.json. */
export function saveGovernance(dir: string, governance: Record<string, Governance>): void {
  const tmp = path.join(dir, `.governance.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(governance, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, path.join(dir, GOVERNANCE_FILE));
}

function idRange(): [number, number] {
  return [DEMO_RANGE_START, DEMO_RANGE_END];
}

function existingId(name: string): string | null {
  const row = getDatabase()
    .prepare('SELECT box_id FROM files WHERE path = ? AND CAST(box_id AS INTEGER) >= ? AND CAST(box_id AS INTEGER) < ? LIMIT 1')
    .get(demoPath(name), ...idRange()) as unknown as { box_id: string } | undefined;
  return row?.box_id ?? null;
}

let lastIssued = 0;

/**
 * The next unused demo ID. It is never lower than one already handed out, so deleting the newest file and
 * uploading another cannot give the new file the old ID (the browser caches previews by ID).
 */
export function nextDemoId(): string {
  const row = getDatabase()
    .prepare('SELECT MAX(CAST(box_id AS INTEGER)) AS m FROM files WHERE CAST(box_id AS INTEGER) >= ? AND CAST(box_id AS INTEGER) < ?')
    .get(FIRST_ID, DEMO_RANGE_END) as unknown as { m: number | null };
  const next = Math.max(row.m === null ? FIRST_ID : row.m + 1, lastIssued + 1);
  if (next >= DEMO_RANGE_END) throw new Error('Too many demo files.');
  lastIssued = next;
  return String(next);
}

/** True for IDs that belong to Demo Mode records. */
export function isDemoId(id: string): boolean {
  const n = /^[0-9]{1,20}$/.test(id) ? Number(id) : NaN;
  return n >= DEMO_RANGE_START && n < DEMO_RANGE_END;
}

/** Extracts one file's text and writes its record. `boxId` defaults to the file's existing ID, or a new one. */
export function indexSampleFile(dir: string, name: string, gov: Governance, boxId?: string): string {
  const full = path.join(dir, name);
  const stat = fs.lstatSync(full);
  const collaborators = (Array.isArray(gov.collaborators) ? gov.collaborators : []).filter((c) => typeof c === 'string' && EMAIL.test(c));
  const text = detectFormat(name) ? previewToPlainText(extractPreview(name, fs.readFileSync(full))).replace(PROTECTED_WORDS, ' ') : '';
  // The retention rules read the description/preview for a protected marker.
  const content = `${gov.doNotDelete ? '[protected] ' : ''}${text}`.trim();
  const id = boxId ?? existingId(name) ?? nextDemoId();

  upsertFileRecord({
    box_id: id,
    name,
    path: demoPath(name),
    owner_email: typeof gov.owner === 'string' && EMAIL.test(gov.owner) ? gov.owner : DEFAULT_OWNER,
    collaborators: collaborators.join(', '),
    content_preview: content,
    last_modified: stat.mtime.toISOString(),
    indexed_at: new Date().toISOString(),
  });
  return id;
}

/** Names of the regular files in a demo folder (no dot files, no governance.json), sorted. */
export function listSampleFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith('.') && n !== GOVERNANCE_FILE)
    .filter((n) => fs.lstatSync(path.join(dir, n)).isFile())
    .sort();
}

/**
 * Indexes every regular file in `srcDir`. When `targetDir` differs from `srcDir` the files are
 * copied there first (that is where the preview API reads from). Returns how many were indexed.
 */
export function seedSampleFiles(srcDir: string, targetDir: string): number {
  fs.mkdirSync(targetDir, { recursive: true });

  const governance = loadGovernance(srcDir);
  // The permissions travel with the files: the target's governance.json becomes the copy that gets edited.
  if (path.resolve(srcDir) !== path.resolve(targetDir)) saveGovernance(targetDir, governance);
  const kept = new Set<string>();
  for (const name of listSampleFiles(srcDir)) {
    const from = path.join(srcDir, name);
    if (fs.lstatSync(from).size > PREVIEW_LIMITS.maxFileBytes) {
      console.error(`[SeedSample] Skipping ${name}: larger than ${PREVIEW_LIMITS.maxFileBytes} bytes.`);
      continue;
    }
    if (path.resolve(srcDir) !== path.resolve(targetDir)) fs.copyFileSync(from, path.join(targetDir, name));
    kept.add(indexSampleFile(targetDir, name, governance[name] ?? {}));
  }

  // Drop demo records left over from files that are no longer in the folder.
  const db = getDatabase();
  const stale = db
    .prepare('SELECT box_id FROM files WHERE CAST(box_id AS INTEGER) >= ? AND CAST(box_id AS INTEGER) < ?')
    .all(...idRange()) as unknown as Array<{ box_id: string }>;
  const remove = db.prepare('DELETE FROM files WHERE box_id = ?');
  for (const row of stale) if (!kept.has(row.box_id)) remove.run(row.box_id);

  return kept.size;
}
