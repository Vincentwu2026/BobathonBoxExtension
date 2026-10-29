import { z } from 'zod';
import { checkRetention, safeDelete, setRetentionPolicy } from '../retention/guard.js';
import { RetentionLogger } from '../retention/logger.js';
import { formatError, formatSuccess } from './box-file-tools.js';

// ============================================================================
// TOOL 1: box_check_retention
// ============================================================================
export const boxCheckRetentionSchema = {
  fileId: z.string().describe('The unique Box File ID to check retention status and collaborator protection for'),
};

export async function handleBoxCheckRetention(args: z.infer<z.ZodObject<typeof boxCheckRetentionSchema>>) {
  try {
    const result = await checkRetention(args.fileId);

    RetentionLogger.log({
      fileId: args.fileId,
      decision: 'CHECKED',
      reason: `Retention check queried: ${result.protected ? 'PROTECTED' : 'UNPROTECTED'} - ${result.reason}`,
      details: {
        fileName: result.fileName,
        activeCollaboratorCount: result.activeCollaborators.length,
        hasDoNotDeleteFlag: result.hasDoNotDeleteFlag,
      },
    });

    return formatSuccess({
      fileId: result.fileId,
      fileName: result.fileName,
      protected: result.protected,
      reason: result.reason,
      activeCollaborators: result.activeCollaborators,
      hasDoNotDeleteFlag: result.hasDoNotDeleteFlag,
      metadataFlags: result.metadataFlags,
      checkedAt: result.checkedAt,
    });
  } catch (error: any) {
    return formatError(`Retention Check failed for file ${args.fileId}: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 2: box_safe_delete
// ============================================================================
export const boxSafeDeleteSchema = {
  fileId: z.string().describe('The Box File ID to safely delete. Deletion is automatically blocked if active collaborators or do_not_delete tags exist'),
  confirmation: z.boolean().optional().default(true).describe('Explicit confirmation flag acknowledging intention to permanently delete unshared file'),
};

export async function handleBoxSafeDelete(args: z.infer<z.ZodObject<typeof boxSafeDeleteSchema>>) {
  try {
    if (!args.confirmation) {
      return formatError('Deletion aborted: confirmation parameter must be true.');
    }

    const result = await safeDelete(args.fileId);

    if (!result.success) {
      return formatSuccess({
        deleted: false,
        fileId: result.fileId,
        fileName: result.fileName,
        decision: result.decision,
        reason: result.reason,
        activeCollaborators: result.activeCollaborators,
        metadataFlags: result.metadataFlags,
      });
    }

    return formatSuccess({
      deleted: true,
      fileId: result.fileId,
      fileName: result.fileName,
      decision: result.decision,
      reason: result.reason,
    });
  } catch (error: any) {
    return formatError(`Safe Delete execution failed for file ${args.fileId}: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 3: box_set_retention_policy
// ============================================================================
export const boxSetRetentionPolicySchema = {
  fileId: z.string().describe('The Box File ID on which to enforce retention protection'),
  tag: z.string().optional().default('do_not_delete').describe('Retention tag to apply (default: "do_not_delete")'),
};

export async function handleBoxSetRetentionPolicy(args: z.infer<z.ZodObject<typeof boxSetRetentionPolicySchema>>) {
  try {
    const result = await setRetentionPolicy(args.fileId, args.tag);
    return formatSuccess(result);
  } catch (error: any) {
    return formatError(`Set Retention Policy failed for file ${args.fileId}: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 4 (Audit Support): box_get_retention_logs
// ============================================================================
export const boxGetRetentionLogsSchema = {
  limit: z.number().int().min(1).max(500).optional().default(50).describe('Maximum number of audit log entries to return'),
};

export async function handleBoxGetRetentionLogs(args: z.infer<z.ZodObject<typeof boxGetRetentionLogsSchema>>) {
  try {
    const logs = RetentionLogger.readLogs(args.limit);
    return formatSuccess({
      totalLogs: logs.length,
      limit: args.limit,
      logs,
    });
  } catch (error: any) {
    return formatError(`Get Retention Logs failed: ${error?.message || String(error)}`);
  }
}
