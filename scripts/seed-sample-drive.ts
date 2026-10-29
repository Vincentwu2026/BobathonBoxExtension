#!/usr/bin/env node
/**
 * CLI Script: index a local folder of real files as Demo Mode records, so they can be searched
 * and previewed in the web UI without any Box connection.
 *
 *   npm run seed-sample-drive -- <folder>
 *
 * The folder is copied into BOX_SAMPLE_DRIVE (default ./demo-files), which is where the preview
 * API reads from. See src/demo/seed-files.ts for the optional governance.json sidecar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sampleDriveDir } from '../src/api/preview.js';
import { seedSampleFiles } from '../src/demo/seed-files.js';
import { closeDatabase, getDatabasePath } from '../src/indexer/schema.js';

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
  const indexed = seedSampleFiles(srcDir, target);
  console.error(`[SeedSample] Indexed ${indexed} file(s) into ${getDatabasePath()}; files copied to ${target}`);
  closeDatabase();
}

main();
