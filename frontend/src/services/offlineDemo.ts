/**
 * Offline Demo Mode engine. Used only when the backend API is unreachable, so the demo
 * still works with `npm run dev` alone. Mirrors the backend's demo behaviour on the
 * bundled copy of the seeded data. Nothing here persists beyond the browser tab.
 */

import { DEMO_DOCUMENTS } from '@/data/demoDocuments';
import type { AuditEntry, DeleteAttempt, DocumentItem } from '@/types';

const STOP = new Set(['a', 'an', 'the', 'and', 'of', 'to', 'in', 'for', 'on']);

function stem(word: string): string {
  return word.toLowerCase().replace(/(ations|ation|ings|ing|es|s)$/, '');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

/** AND-match across query terms with prefix + light stemming, scored by weighted term hits. */
export function offlineSearch(query: string, limit: number): DocumentItem[] {
  const terms = tokenize(query).map(stem);
  if (terms.length === 0) return [];

  const scored = DEMO_DOCUMENTS.map((doc) => {
    const nameTokens = tokenize(doc.name).map(stem);
    const bodyTokens = tokenize(`${doc.preview} ${doc.path} ${doc.owner} ${doc.collaborators.map((c) => c.email).join(' ')}`).map(stem);
    let score = 0;
    for (const term of terms) {
      const inName = nameTokens.filter((t) => t.startsWith(term)).length;
      const inBody = bodyTokens.filter((t) => t.startsWith(term)).length;
      if (inName + inBody === 0) return { doc, score: 0 };
      score += inName * 3 + inBody;
    }
    return { doc, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const best = scored[0]?.score ?? 1;
  return scored.map(({ doc, score }) => ({
    ...doc,
    relevance: Math.max(1, Math.round((100 * score) / best)),
    snippet: makeSnippet(doc.preview, terms),
  }));
}

/** Wraps matching words in <mark>…</mark>; the UI renders only that tag, as text, never as HTML. */
function makeSnippet(preview: string, terms: string[]): string {
  const clean = preview.replace(/<[^>]*>/g, '');
  return clean.replace(/[A-Za-z0-9]+/g, (word) => (terms.some((t) => stem(word).startsWith(t)) ? `<mark>${word}</mark>` : word));
}

export function offlineDocuments(): DocumentItem[] {
  return DEMO_DOCUMENTS;
}

export function offlineDocument(id: string): DocumentItem | undefined {
  return DEMO_DOCUMENTS.find((d) => d.id === id);
}

// ---------------------------------------------------------------------------- audit

const SEED: ReadonlyArray<{ id: string; minutesAgo: number; outcome: 'blocked' | 'allowed' | 'info' }> = [
  { id: '9000000017', minutesAgo: 5, outcome: 'blocked' },
  { id: '9000000016', minutesAgo: 18, outcome: 'allowed' },
  { id: '9000000001', minutesAgo: 42, outcome: 'blocked' },
  { id: '9000000012', minutesAgo: 75, outcome: 'info' },
  { id: '9000000013', minutesAgo: 190, outcome: 'blocked' },
  { id: '9000000011', minutesAgo: 320, outcome: 'blocked' },
  { id: '9000000008', minutesAgo: 1400, outcome: 'info' },
];

const sessionEntries: AuditEntry[] = [];
const baseTime = Date.now();

function seededAudit(): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const s of SEED) {
    const doc = offlineDocument(s.id);
    if (!doc) continue;
    out.push({
      id: `seed-${s.id}`,
      timestamp: new Date(baseTime - s.minutesAgo * 60_000).toISOString(),
      fileId: doc.id,
      fileName: doc.name,
      action: s.outcome === 'info' ? 'Retention check' : 'Delete attempt (simulated)',
      result: s.outcome,
      reason:
        s.outcome === 'blocked'
          ? `Delete attempt blocked: ${doc.retention.explanation}`
          : s.outcome === 'allowed'
            ? 'Delete attempt (simulated): deletion allowed. Nothing was deleted.'
            : `Retention check: ${doc.retention.status === 'protected' ? 'PROTECTED' : 'UNPROTECTED'} - ${doc.retention.explanation}`,
    });
  }
  return out;
}

export function offlineAudit(limit: number): AuditEntry[] {
  return [...sessionEntries, ...seededAudit()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export function offlineDeleteAttempt(id: string): DeleteAttempt | undefined {
  const doc = offlineDocument(id);
  if (!doc) return undefined;
  const blocked = doc.retention.status !== 'unprotected';
  sessionEntries.push({
    id: `session-${Date.now()}-${sessionEntries.length}`,
    timestamp: new Date().toISOString(),
    fileId: doc.id,
    fileName: doc.name,
    action: 'Delete attempt (simulated)',
    result: blocked ? 'blocked' : 'allowed',
    reason: blocked
      ? `Delete attempt blocked: ${doc.retention.explanation}`
      : 'Delete attempt (simulated): deletion allowed. Nothing was deleted.',
  });
  return { outcome: blocked ? 'blocked' : 'allowed', dryRun: true, document: doc };
}
