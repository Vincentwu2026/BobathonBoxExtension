import { getBoxClient } from '../box-client.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';
import { RetentionLogger } from './logger.js';

export interface ActiveCollaborator {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface RetentionCheckResult {
  fileId: string;
  fileName?: string;
  protected: boolean;
  reason: string;
  activeCollaborators: ActiveCollaborator[];
  hasDoNotDeleteFlag: boolean;
  metadataFlags: string[];
  checkedAt: string;
}

export interface SafeDeleteResult {
  success: boolean;
  fileId: string;
  fileName?: string;
  decision: 'DELETED' | 'BLOCKED';
  reason: string;
  activeCollaborators: ActiveCollaborator[];
  metadataFlags: string[];
}

/**
 * Checks the retention and deletion-protection status of a Box file.
 *
 * Rules:
 * A file is PROTECTED if:
 * 1. It has one or more active collaborators (status 'accepted' or pending active role)
 * OR
 * 2. It contains the metadata tag or attribute 'do_not_delete'.
 */
export async function checkRetention(fileId: string): Promise<RetentionCheckResult> {
  const client = await getBoxClient();
  const activeCollaborators: ActiveCollaborator[] = [];
  const metadataFlags: string[] = [];
  let fileName = 'Unknown';
  let hasDoNotDeleteFlag = false;

  // 1. Fetch file basic details and tags
  try {
    const file = await withRateLimitRetry(
      () =>
        client.files.getFileById(fileId, {
          queryParams: {
            fields: ['id', 'name', 'tags', 'description', 'owned_by', 'item_status'],
          },
        }),
      {},
      `check_retention_file_${fileId}`
    );

    fileName = file.name || 'Unknown';

    // Check tags
    if (file.tags && Array.isArray(file.tags)) {
      for (const tag of file.tags) {
        metadataFlags.push(tag);
        if (tag.toLowerCase() === 'do_not_delete' || tag.toLowerCase() === 'retention_protected') {
          hasDoNotDeleteFlag = true;
        }
      }
    }

    // Check description for do_not_delete annotations
    if (file.description && /do_not_delete|\[protected\]/i.test(file.description)) {
      hasDoNotDeleteFlag = true;
      metadataFlags.push('description:do_not_delete');
    }
  } catch (err: any) {
    console.error(`[RetentionGuard] Warning: Could not fetch file details for ${fileId}: ${err?.message || err}`);
  }

  // 2. Fetch file metadata templates to check custom metadata attributes
  try {
    const metadataResp = await withRateLimitRetry(
      () => client.fileMetadata.getFileMetadata(fileId),
      { maxRetries: 2 },
      `check_retention_metadata_${fileId}`
    );

    if (metadataResp?.entries) {
      for (const md of metadataResp.entries) {
        const raw = (md as any).rawData || md;
        for (const [key, val] of Object.entries(raw)) {
          if (
            key.toLowerCase() === 'do_not_delete' ||
            key.toLowerCase() === 'retention' ||
            String(val).toLowerCase() === 'do_not_delete' ||
            String(val).toLowerCase() === 'protected'
          ) {
            hasDoNotDeleteFlag = true;
            metadataFlags.push(`metadata:${key}=${val}`);
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal if metadata is not configured on this enterprise tier
  }

  // 3. Fetch file collaborators to inspect active sharing
  try {
    const collabResp = await withRateLimitRetry(
      () => client.listCollaborations.getFileCollaborations(fileId),
      {},
      `check_retention_collaborators_${fileId}`
    );

    if (collabResp?.entries) {
      for (const collab of collabResp.entries) {
        const status = (collab.status || 'accepted').toLowerCase();
        // Considered active if accepted or pending invitation
        if (status === 'accepted' || status === 'pending') {
          const user = collab.accessibleBy;
          const userEmail = user && 'login' in user ? (user as any).login : 'group@box.enterprise';
          activeCollaborators.push({
            id: collab.id,
            name: user?.name || 'Unknown Collaborator',
            email: userEmail,
            role: collab.role || 'viewer',
            status,
          });
        }
      }
    }
  } catch (err: any) {
    console.error(`[RetentionGuard] Warning: Could not fetch collaborations for ${fileId}: ${err?.message || err}`);
  }

  // Evaluate retention protection logic
  let isProtected = false;
  const reasons: string[] = [];

  if (hasDoNotDeleteFlag) {
    isProtected = true;
    reasons.push(`File is tagged with explicit retention policy (${metadataFlags.join(', ')})`);
  }

  if (activeCollaborators.length > 0) {
    isProtected = true;
    const collabSummary = activeCollaborators.map((c) => `${c.name} (${c.email}, ${c.role})`).join('; ');
    reasons.push(`File has ${activeCollaborators.length} active collaborator(s): ${collabSummary}`);
  }

  const finalReason = isProtected
    ? reasons.join('. ')
    : 'File has no active collaborators and no do_not_delete tags. Deletion permitted under corporate policy.';

  return {
    fileId,
    fileName,
    protected: isProtected,
    reason: finalReason,
    activeCollaborators,
    hasDoNotDeleteFlag,
    metadataFlags,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Sets the 'do_not_delete' retention policy tag on a Box file.
 */
export async function setRetentionPolicy(
  fileId: string,
  customTag = 'do_not_delete'
): Promise<{ success: boolean; fileId: string; tags: string[]; message: string }> {
  const client = await getBoxClient();

  // 1. Retrieve current file tags
  const currentFile = await withRateLimitRetry(
    () =>
      client.files.getFileById(fileId, {
        queryParams: { fields: ['id', 'name', 'tags'] },
      }),
    {},
    `get_tags_for_retention_${fileId}`
  );

  const existingTags: string[] = Array.isArray(currentFile.tags) ? [...currentFile.tags] : [];
  if (!existingTags.includes(customTag)) {
    existingTags.push(customTag);
  }

  // 2. Update tags on Box file
  await withRateLimitRetry(
    () =>
      client.files.updateFileById(fileId, {
        requestBody: {
          tags: existingTags,
        },
      }),
    {},
    `set_retention_policy_${fileId}`
  );

  // 3. Try to write metadata key if possible
  try {
    await withRateLimitRetry(
      () =>
        client.fileMetadata.createFileMetadataById(fileId, 'global', 'properties', {
          do_not_delete: 'true',
          retention_applied_at: new Date().toISOString(),
        }),
      { maxRetries: 1 },
      `set_metadata_retention_${fileId}`
    );
  } catch (mdErr) {
    // If metadata already exists or properties not available, update or continue
    try {
      await withRateLimitRetry(
        () =>
          client.fileMetadata.updateFileMetadataById(fileId, 'global', 'properties', [
            {
              op: 'add',
              path: '/do_not_delete',
              value: 'true',
            },
          ]),
        { maxRetries: 1 },
        `update_metadata_retention_${fileId}`
      );
    } catch {
      // Tags update is primary and already applied
    }
  }

  RetentionLogger.log({
    fileId,
    decision: 'POLICY_SET',
    reason: `Applied retention tag '${customTag}' and metadata protection to file '${currentFile.name}' (${fileId})`,
    details: { tags: existingTags, fileName: currentFile.name },
  });

  return {
    success: true,
    fileId,
    tags: existingTags,
    message: `Retention policy successfully applied to file '${currentFile.name}' (${fileId}). Protected from deletion.`,
  };
}

/**
 * Executes a protected safe deletion.
 * Validates retention guard before deleting. If protected, operation is blocked and logged.
 */
export async function safeDelete(fileId: string): Promise<SafeDeleteResult> {
  const check = await checkRetention(fileId);

  if (check.protected) {
    RetentionLogger.log({
      fileId,
      decision: 'BLOCKED',
      reason: `Safe delete refused: ${check.reason}`,
      details: {
        fileName: check.fileName,
        activeCollaborators: check.activeCollaborators,
        metadataFlags: check.metadataFlags,
      },
    });

    return {
      success: false,
      fileId,
      fileName: check.fileName,
      decision: 'BLOCKED',
      reason: `DELETION BLOCKED: ${check.reason}`,
      activeCollaborators: check.activeCollaborators,
      metadataFlags: check.metadataFlags,
    };
  }

  // File is not protected: proceed with deletion
  const client = await getBoxClient();
  await withRateLimitRetry(
    () => client.files.deleteFileById(fileId),
    {},
    `safe_delete_file_${fileId}`
  );

  RetentionLogger.log({
    fileId,
    decision: 'DELETED',
    reason: `File '${check.fileName}' (${fileId}) successfully deleted after passing all retention and collaborator checks.`,
    details: { fileName: check.fileName },
  });

  return {
    success: true,
    fileId,
    fileName: check.fileName,
    decision: 'DELETED',
    reason: `File '${check.fileName}' (${fileId}) was safely deleted. No active collaborators or retention flags were present.`,
    activeCollaborators: [],
    metadataFlags: [],
  };
}
