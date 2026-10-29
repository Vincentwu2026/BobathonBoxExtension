/**
 * Audit trail access for the web UI.
 *  - Live Mode reads the production retention log (BOX_RETENTION_LOG).
 *  - Demo Mode reads/writes a SEPARATE file so simulated attempts never pollute the real audit trail.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RetentionLogger, type RetentionLogEntry } from '../retention/logger.js';
import { evaluateDemoRetention } from '../demo/demo-retention.js';
import type { AuditEntryDTO, AuditResult } from './dto.js';

export const DEMO_AUDIT_SEED: ReadonlyArray<{ fileId: string; minutesAgo: number; outcome: 'blocked' | 'allowed' | 'info' }> = [
  { fileId: '9000000017', minutesAgo: 5, outcome: 'blocked' },
  { fileId: '9000000016', minutesAgo: 18, outcome: 'allowed' },
  { fileId: '9000000001', minutesAgo: 42, outcome: 'blocked' },
  { fileId: '9000000012', minutesAgo: 75, outcome: 'info' },
  { fileId: '9000000013', minutesAgo: 190, outcome: 'blocked' },
  { fileId: '9000000011', minutesAgo: 320, outcome: 'blocked' },
  { fileId: '9000000008', minutesAgo: 1400, outcome: 'info' },
];

function demoAuditPath(): string {
  return process.env.WEB_DEMO_AUDIT_LOG || path.resolve(process.cwd(), 'data', 'demo-audit-log.jsonl');
}

function resultOf(entry: RetentionLogEntry): AuditResult {
  if (entry.decision === 'BLOCKED') return 'blocked';
  if (entry.decision === 'DELETED' || entry.details?.outcome === 'allowed') return 'allowed';
  return 'info';
}

function actionOf(entry: RetentionLogEntry): string {
  if (entry.details?.dryRun) return 'Delete attempt (dry run)';
  if (entry.details?.simulated) return 'Delete attempt (simulated)';
  switch (entry.decision) {
    case 'BLOCKED':
      return 'Delete attempt';
    case 'DELETED':
      return 'Delete';
    case 'POLICY_SET':
      return 'Set retention policy';
    default:
      return 'Retention check';
  }
}

function toDto(entry: RetentionLogEntry, index: number): AuditEntryDTO {
  return {
    id: `${entry.timestamp}-${entry.fileId}-${index}`,
    timestamp: entry.timestamp,
    fileId: entry.fileId,
    fileName: typeof entry.details?.fileName === 'string' ? entry.details.fileName : entry.fileId,
    action: actionOf(entry),
    result: resultOf(entry),
    reason: entry.reason,
  };
}

export function readLiveAudit(limit: number): AuditEntryDTO[] {
  return RetentionLogger.readLogs(limit).map(toDto);
}

function readDemoLines(): RetentionLogEntry[] {
  const file = demoAuditPath();
  if (!fs.existsSync(file)) return [];
  const out: RetentionLogEntry[] = [];
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as RetentionLogEntry);
    } catch {
      // ignore malformed line
    }
  }
  return out;
}

export function appendDemoAudit(entry: RetentionLogEntry): void {
  const file = demoAuditPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', { encoding: 'utf-8' });
}

/** Writes illustrative history on first run so the Audit page is not empty. Reasons come from real evaluation. */
export function ensureDemoAuditSeed(): void {
  if (readDemoLines().length > 0) return;
  const now = Date.now();
  const entries: RetentionLogEntry[] = [];

  for (const s of [...DEMO_AUDIT_SEED].reverse()) {
    const ev = evaluateDemoRetention(s.fileId);
    if (!ev) continue;
    const timestamp = new Date(now - s.minutesAgo * 60_000).toISOString();
    if (s.outcome === 'info') {
      entries.push({
        timestamp,
        fileId: ev.fileId,
        decision: 'CHECKED',
        reason: `Retention check: ${ev.protected ? 'PROTECTED' : 'UNPROTECTED'} - ${ev.explanation}`,
        details: { fileName: ev.fileName, demo: true },
      });
    } else if (s.outcome === 'blocked') {
      entries.push({
        timestamp,
        fileId: ev.fileId,
        decision: 'BLOCKED',
        reason: `Delete attempt blocked: ${ev.explanation}`,
        details: { fileName: ev.fileName, demo: true, simulated: true },
      });
    } else {
      entries.push({
        timestamp,
        fileId: ev.fileId,
        decision: 'CHECKED',
        reason: 'Delete attempt (simulated): deletion allowed. Nothing was deleted.',
        details: { fileName: ev.fileName, demo: true, simulated: true, outcome: 'allowed' },
      });
    }
  }

  for (const e of entries) appendDemoAudit(e);
}

export function readDemoAudit(limit: number): AuditEntryDTO[] {
  ensureDemoAuditSeed();
  return readDemoLines()
    .slice(-limit)
    .reverse()
    .map(toDto);
}

export function logDemoDeleteAttempt(fileId: string, fileName: string, blocked: boolean, explanation: string): void {
  appendDemoAudit({
    timestamp: new Date().toISOString(),
    fileId,
    decision: blocked ? 'BLOCKED' : 'CHECKED',
    reason: blocked
      ? `Delete attempt blocked: ${explanation}`
      : 'Delete attempt (simulated): deletion allowed. Nothing was deleted.',
    details: { fileName, demo: true, simulated: true, ...(blocked ? {} : { outcome: 'allowed' }) },
  });
}
