/**
 * DEMO ONLY: retention check evaluated against the locally seeded SQLite index.
 *
 * Mirrors the rules in src/retention/guard.ts (checkRetention) but reads from the
 * local `files` table instead of the Box API. It is read-only: it never calls Box,
 * never deletes anything, and never writes to the production retention audit log.
 *
 * Rules mirrored from guard.ts:
 *   1. One or more active collaborators        -> PROTECTED
 *   2. `do_not_delete` / `[protected]` marker  -> PROTECTED
 *      (guard.ts checks the Box description; the crawler stores that description
 *       in `content_preview`, so the same marker is checked there.)
 */

import { z } from 'zod';
import { getFileRecord } from '../indexer/schema.js';
import { formatError, formatSuccess } from '../tools/box-file-tools.js';
import { hasDoNotDeleteDescription, isRetentionProtected } from '../retention/rules.js';

export const demoRetentionCheckSchema = {
  fileId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'fileId must be 1-64 letters, digits, underscores or hyphens')
    .describe('Box file ID from the seeded demo dataset (e.g. "9000000001")'),
};

export interface DemoRetentionResult {
  demo: true;
  source: 'local seeded index (no Box API call)';
  fileId: string;
  fileName: string;
  path: string;
  owner: string;
  protected: boolean;
  wouldBeBlocked: boolean;
  activeCollaborators: string[];
  hasDoNotDeleteFlag: boolean;
  reasons: string[];
  explanation: string;
  howToUnblock: string[];
}

/**
 * Evaluates deletion protection for a seeded file. Returns null if the file is not in the index.
 */
export function evaluateDemoRetention(fileId: string): DemoRetentionResult | null {
  const record = getFileRecord(fileId);
  if (!record) return null;

  const activeCollaborators = (record.collaborators || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const hasDoNotDeleteFlag = hasDoNotDeleteDescription(record.content_preview);

  const reasons: string[] = [];
  const howToUnblock: string[] = [];

  if (hasDoNotDeleteFlag) {
    reasons.push('File is tagged with an explicit retention marker (description:do_not_delete)');
    howToUnblock.push('Remove the do_not_delete / [protected] marker from the file description or tags');
  }
  if (activeCollaborators.length > 0) {
    reasons.push(`File has ${activeCollaborators.length} active collaborator(s): ${activeCollaborators.join('; ')}`);
    howToUnblock.push('Remove all collaborators from the file');
  }

  const isProtected = isRetentionProtected(activeCollaborators.length, hasDoNotDeleteFlag);
  const explanation = isProtected
    ? `Deletion would be BLOCKED. ${reasons.join('. ')}.`
    : 'Deletion would be PERMITTED. File has no active collaborators and no do_not_delete marker.';

  return {
    demo: true,
    source: 'local seeded index (no Box API call)',
    fileId: record.box_id,
    fileName: record.name,
    path: record.path,
    owner: record.owner_email,
    protected: isProtected,
    wouldBeBlocked: isProtected,
    activeCollaborators,
    hasDoNotDeleteFlag,
    reasons,
    explanation,
    howToUnblock,
  };
}

export async function handleDemoRetentionCheck(args: z.infer<z.ZodObject<typeof demoRetentionCheckSchema>>) {
  try {
    const result = evaluateDemoRetention(args.fileId);
    if (!result) {
      return formatError(
        `No file with ID '${args.fileId}' in the seeded demo index. Run 'npm run seed-demo' and use an ID from index_search results.`
      );
    }
    return formatSuccess(result);
  } catch (error: any) {
    console.error(`[DemoRetention] Check failed: ${error?.message || error}`);
    return formatError('Demo retention check failed.');
  }
}
