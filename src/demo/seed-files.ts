/**
 * Loads a folder of real files into the local index as Demo Mode records, so they can be searched
 * and previewed without any Box connection. Used by `npm run seed-sample-drive` and, for the bundled
 * ./demo-files folder, by the API on start-up.
 *
 * Each file's text is extracted with the same code the preview uses and stored as the searchable
 * content, so a search for a word INSIDE a document finds it.
 *
 * Optional <folder>/governance.json supplies what a download cannot carry:
 *   { "Report.docx": { "owner": "a@x.com", "collaborators": ["b@x.com"], "doNotDelete": true } }
 * Without it, a file gets the current user as owner and no collaborators.
 *
 * Records use IDs 9000000101+ (the demo prefix). Re-running updates them in place, and other
 * demo records (files no longer in the folder, the older bundled dataset) are removed from the local index.
 * This only touches the local SQLite index: never Box, never the files themselves.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDatabase, upsertFileRecord } from '../indexer/schema.js';
import { PREVIEW_LIMITS, detectFormat, extractPreview, previewToPlainText } from '../preview/index.js';

interface Governance {
  owner?: string;
  collaborators?: string[];
  doNotDelete?: boolean;
}

const FIRST_ID = 9000000101;
// Every ID in this range belongs to Demo Mode and is replaced on each seed (this also clears the
// older bundled demo dataset, which used 9000000001+).
const DEMO_RANGE_START = 9000000001;
const DEMO_RANGE_END = 9000001000;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+$/;

function loadGovernance(dir: string): Record<string, Governance> {
  const file = path.join(dir, 'governance.json');
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error('[SeedSample] governance.json is not valid JSON; ignoring it.');
    return {};
  }
}

/**
 * Indexes every regular file in `srcDir`. When `targetDir` differs from `srcDir` the files are
 * copied there first (that is where the preview API reads from). Returns how many were indexed.
 */
export function seedSampleFiles(srcDir: string, targetDir: string): number {
  fs.mkdirSync(targetDir, { recursive: true });

  const governance = loadGovernance(srcDir);
  const names = fs
    .readdirSync(srcDir)
    .filter((n) => !n.startsWith('.') && n !== 'governance.json')
    .filter((n) => fs.lstatSync(path.join(srcDir, n)).isFile())
    .sort();

  let id = FIRST_ID;
  const kept = new Set<string>();
  for (const name of names) {
    const from = path.join(srcDir, name);
    if (fs.lstatSync(from).size > PREVIEW_LIMITS.maxFileBytes) {
      console.error(`[SeedSample] Skipping ${name}: larger than ${PREVIEW_LIMITS.maxFileBytes} bytes.`);
      continue;
    }
    if (path.resolve(srcDir) !== path.resolve(targetDir)) fs.copyFileSync(from, path.join(targetDir, name));

    const gov = governance[name] ?? {};
    const collaborators = (Array.isArray(gov.collaborators) ? gov.collaborators : []).filter((c) => typeof c === 'string' && EMAIL.test(c));
    const text = detectFormat(name) ? previewToPlainText(extractPreview(name, fs.readFileSync(from))) : '';
    // The retention rules read the description/preview for a protected marker.
    const content = `${gov.doNotDelete ? '[protected] ' : ''}${text}`.trim();

    const boxId = String(id++);
    kept.add(boxId);
    upsertFileRecord({
      box_id: boxId,
      name,
      path: `/Demo Files/${name}`,
      owner_email: typeof gov.owner === 'string' && EMAIL.test(gov.owner) ? gov.owner : 'you@sample.local',
      collaborators: collaborators.join(', '),
      content_preview: content,
      last_modified: fs.statSync(from).mtime.toISOString(),
      indexed_at: new Date().toISOString(),
    });
  }

  // Drop demo records left over from files that are no longer in the folder.
  const db = getDatabase();
  const stale = db
    .prepare('SELECT box_id FROM files WHERE CAST(box_id AS INTEGER) >= ? AND CAST(box_id AS INTEGER) < ?')
    .all(DEMO_RANGE_START, DEMO_RANGE_END) as unknown as Array<{ box_id: string }>;
  const remove = db.prepare('DELETE FROM files WHERE box_id = ?');
  for (const row of stale) if (!kept.has(row.box_id)) remove.run(row.box_id);

  return kept.size;
}
