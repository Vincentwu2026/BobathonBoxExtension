#!/usr/bin/env node
/**
 * CLI Script: index a local folder of real files as Demo Mode records, so they can be searched
 * and previewed in the web UI without any Box connection.
 *
 *   npm run seed-sample-drive -- <folder>
 *
 * The folder is copied into BOX_SAMPLE_DRIVE (default ./data/sample-drive), which is where the
 * preview API reads from. Each file's text is extracted with the same code the preview uses and
 * stored as the searchable content, so a search for a word INSIDE a document finds it.
 *
 * Optional <folder>/governance.json supplies what a download cannot carry:
 *   { "Report.docx": { "owner": "a@x.com", "collaborators": ["b@x.com"], "doNotDelete": true } }
 * Without it, a file gets the current user as owner and no collaborators.
 *
 * Records use IDs 9000000101+ (the demo prefix). Re-running updates them in place.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sampleDriveDir } from '../src/api/preview.js';
import { closeDatabase, getDatabasePath, upsertFileRecord } from '../src/indexer/schema.js';
import { PREVIEW_LIMITS, detectFormat, extractPreview, previewToPlainText } from '../src/preview/index.js';

interface Governance {
  owner?: string;
  collaborators?: string[];
  doNotDelete?: boolean;
}

const FIRST_ID = 9000000101;
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

function main(): void {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: npm run seed-sample-drive -- <folder>');
    process.exit(1);
  }
  const srcDir = path.resolve(source);
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    console.error(`Not a folder: ${srcDir}`);
    process.exit(1);
  }

  const target = sampleDriveDir();
  fs.mkdirSync(target, { recursive: true });

  const governance = loadGovernance(srcDir);
  const names = fs
    .readdirSync(srcDir)
    .filter((n) => !n.startsWith('.') && n !== 'governance.json')
    .filter((n) => fs.lstatSync(path.join(srcDir, n)).isFile())
    .sort();

  let id = FIRST_ID;
  let indexed = 0;
  for (const name of names) {
    const from = path.join(srcDir, name);
    if (fs.lstatSync(from).size > PREVIEW_LIMITS.maxFileBytes) {
      console.error(`[SeedSample] Skipping ${name}: larger than ${PREVIEW_LIMITS.maxFileBytes} bytes.`);
      continue;
    }
    if (path.resolve(srcDir) !== path.resolve(target)) fs.copyFileSync(from, path.join(target, name));

    const gov = governance[name] ?? {};
    const collaborators = (Array.isArray(gov.collaborators) ? gov.collaborators : []).filter((c) => typeof c === 'string' && EMAIL.test(c));
    const text = detectFormat(name) ? previewToPlainText(extractPreview(name, fs.readFileSync(from))) : '';
    // The retention rules read the description/preview for a protected marker.
    const content = `${gov.doNotDelete ? '[protected] ' : ''}${text}`.trim();

    upsertFileRecord({
      box_id: String(id++),
      name,
      path: `/Sample Drive/${name}`,
      owner_email: typeof gov.owner === 'string' && EMAIL.test(gov.owner) ? gov.owner : 'you@sample.local',
      collaborators: collaborators.join(', '),
      content_preview: content,
      last_modified: fs.statSync(from).mtime.toISOString(),
      indexed_at: new Date().toISOString(),
    });
    indexed += 1;
  }

  console.error(`[SeedSample] Indexed ${indexed} file(s) into ${getDatabasePath()}; files copied to ${target}`);
  closeDatabase();
}

main();
