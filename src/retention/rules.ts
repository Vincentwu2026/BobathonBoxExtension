/**
 * Single source of truth for the retention rules.
 *
 * A file is PROTECTED when it has at least one active collaborator OR carries a
 * do_not_delete marker (Box tag, description annotation, or custom metadata).
 *
 * These are pure functions with no I/O, shared by:
 *  - src/retention/guard.ts       (MCP tools: box_check_retention, box_safe_delete)
 *  - src/api/live.ts              (web UI, Live Box mode)
 *  - src/api/retention-view.ts    (web UI view model)
 *  - src/demo/demo-retention.ts   (Demo mode, seeded index)
 */

const DESCRIPTION_PATTERN = /do_not_delete|\[protected\]/i;

/** Box tag that marks a file as protected. */
export function isDoNotDeleteTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return t === 'do_not_delete' || t === 'retention_protected';
}

/** Free-text annotation (Box description, or the indexed copy of it) that marks a file as protected. */
export function hasDoNotDeleteDescription(description: string | null | undefined): boolean {
  return !!description && DESCRIPTION_PATTERN.test(description);
}

/** Custom metadata key/value pair that marks a file as protected. */
export function isDoNotDeleteMetadata(key: string, value: unknown): boolean {
  const k = key.toLowerCase();
  const v = String(value).toLowerCase();
  return k === 'do_not_delete' || k === 'retention' || v === 'do_not_delete' || v === 'protected';
}

/** Only accepted or pending collaborations count as active. */
export function isActiveCollaboratorStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'accepted' || s === 'pending';
}

/** The core rule. */
export function isRetentionProtected(activeCollaboratorCount: number, hasDoNotDeleteFlag: boolean): boolean {
  return activeCollaboratorCount > 0 || hasDoNotDeleteFlag;
}
