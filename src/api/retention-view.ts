import type { CollaboratorDTO, RetentionDTO, RetentionReasonDTO } from './dto.js';

/**
 * Builds the UI retention view from evaluated inputs.
 * Rules mirror src/retention/guard.ts: protected if there is at least one active
 * collaborator OR a do_not_delete marker.
 */
export function buildRetention(collaborators: CollaboratorDTO[], flags: string[]): RetentionDTO {
  const reasons: RetentionReasonDTO[] = [];

  if (flags.length > 0) {
    reasons.push({ code: 'DO_NOT_DELETE', message: `Retention marker present (${flags.join(', ')})` });
  }
  if (collaborators.length > 0) {
    const who = collaborators.map((c) => c.email).join('; ');
    reasons.push({
      code: 'ACTIVE_COLLABORATORS',
      message: `${collaborators.length} active collaborator(s): ${who}`,
    });
  }

  const isProtected = reasons.length > 0;
  return {
    status: isProtected ? 'protected' : 'unprotected',
    reasons,
    collaboratorCount: collaborators.length,
    hasDoNotDeleteFlag: flags.length > 0,
    explanation: isProtected
      ? `Deletion would be blocked. ${reasons.map((r) => r.message).join('. ')}.`
      : 'Deletion would be permitted. No active collaborators and no do_not_delete marker.',
  };
}

/** Fail-closed view used when retention could not be verified. */
export function unverifiedRetention(): RetentionDTO {
  return {
    status: 'unknown',
    reasons: [
      {
        code: 'UNVERIFIED',
        message: 'Retention status could not be verified against Box. Treated as protected.',
      },
    ],
    collaboratorCount: 0,
    hasDoNotDeleteFlag: false,
    explanation: 'Retention status could not be verified, so deletion is treated as blocked (fail-closed).',
  };
}

export function departmentFromPath(filePath: string): string {
  const first = filePath.split('/').filter(Boolean)[0];
  return first ? first.replace(/_/g, ' ') : 'Unfiled';
}
