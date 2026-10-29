import { apiGet, apiPost } from '@/lib/http';
import type { DocumentItem } from '@/types';

export interface SearchOutcome {
  results: DocumentItem[];
  /** 'bob' when Bob chose the files; 'keyword' when Bob was unavailable and word matching was used instead. */
  source: 'bob' | 'keyword';
}

/** Every demo file. */
export async function listDocuments(): Promise<DocumentItem[]> {
  return (await apiGet<{ documents: DocumentItem[] }>('/demo/documents')).documents;
}

/** Search through Bob: he reads the files and picks the relevant ones (a few seconds). */
export function searchDocuments(query: string): Promise<SearchOutcome> {
  return apiPost<SearchOutcome>('/demo/search', 150_000, { query: query.trim() });
}
