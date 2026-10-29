import { apiGet } from '@/lib/http';
import type { DocumentItem } from '@/types';

/** Every demo file. */
export async function listDocuments(): Promise<DocumentItem[]> {
  return (await apiGet<{ documents: DocumentItem[] }>('/demo/documents')).documents;
}

/** Full-text search over the demo files (SQLite FTS5), best match first. */
export async function searchDocuments(query: string): Promise<DocumentItem[]> {
  const r = await apiGet<{ results: DocumentItem[] }>(`/demo/search?q=${encodeURIComponent(query.trim())}&limit=20`);
  return r.results;
}
