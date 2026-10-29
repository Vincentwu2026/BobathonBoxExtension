/**
 * Demo Mode data access for the web UI. Read-only; never touches Box.
 * Reads the seeded SQLite index and reuses the demo retention evaluator.
 */

import { getDatabase } from '../indexer/schema.js';
import { searchLocalIndex } from '../indexer/search.js';
import { evaluateDemoRetention } from '../demo/demo-retention.js';
import type { CollaboratorDTO, DocumentDTO } from './dto.js';
import { buildRetention, departmentFromPath } from './retention-view.js';

/**
 * Records created by src/demo/seed-files.ts use IDs 9000000101+. Filtering on the
 * prefix keeps smoke-test fixtures and any real crawled files out of the demo.
 */
export const DEMO_ID_PREFIX = '9000000';

function toDocument(
  boxId: string,
  extras: { snippet?: string; relevance?: number | null } = {}
): DocumentDTO | null {
  const evaluated = evaluateDemoRetention(boxId);
  if (!evaluated) return null;

  const collaborators: CollaboratorDTO[] = evaluated.activeCollaborators.map((email) => ({
    name: null,
    email,
    role: null,
    status: 'accepted',
  }));

  const record = getDatabase()
    .prepare('SELECT content_preview, last_modified FROM files WHERE box_id = ? LIMIT 1')
    .get(boxId) as unknown as { content_preview: string; last_modified: string } | undefined;

  return {
    id: evaluated.fileId,
    name: evaluated.fileName,
    path: evaluated.path,
    department: departmentFromPath(evaluated.path),
    owner: evaluated.owner,
    collaborators,
    modifiedAt: record?.last_modified || null,
    preview: record?.content_preview || '',
    snippet: extras.snippet,
    relevance: extras.relevance ?? null,
    retention: buildRetention(collaborators, evaluated.hasDoNotDeleteFlag ? ['description:do_not_delete'] : []),
    url: null,
  };
}

export function listDemoDocuments(): DocumentDTO[] {
  const rows = getDatabase()
    .prepare('SELECT box_id FROM files WHERE box_id LIKE ? ORDER BY path')
    .all(`${DEMO_ID_PREFIX}%`) as unknown as Array<{ box_id: string }>;

  return rows.map((r) => toDocument(r.box_id)).filter((d): d is DocumentDTO => d !== null);
}

export function searchDemoDocuments(query: string, limit: number): DocumentDTO[] {
  // Over-fetch, then filter to seeded records so smoke-test fixtures never leak in.
  const { results } = searchLocalIndex({ query, limit: 100 });
  const hits = results.filter((r) => r.box_id.startsWith(DEMO_ID_PREFIX)).slice(0, limit);
  if (hits.length === 0) return [];

  // FTS5 bm25 ranks are negative; more negative = better. Normalise against the best hit.
  const best = Math.min(...hits.map((h) => h.rank ?? 0));

  return hits
    .map((hit) => {
      const rank = hit.rank ?? 0;
      const relevance = best === 0 ? 100 : Math.max(1, Math.round((100 * rank) / best));
      return toDocument(hit.box_id, { snippet: hit.snippet, relevance });
    })
    .filter((d): d is DocumentDTO => d !== null);
}
