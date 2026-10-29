import { apiGet } from '@/lib/http';
import { demoCall, liveCall, type Result } from '@/services/shared';
import { offlineSearch } from '@/services/offlineDemo';
import type { DocumentItem, Mode } from '@/types';

interface SearchResponse {
  query: string;
  results: DocumentItem[];
}

export async function searchDocuments(mode: Mode, query: string, limit = 20): Promise<Result<DocumentItem[]>> {
  const q = encodeURIComponent(query.trim());
  const path = `/${mode}/search?q=${q}&limit=${limit}`;

  if (mode === 'live') {
    const r = await liveCall(() => apiGet<SearchResponse>(path));
    return { data: r.data.results, source: r.source };
  }
  const r = await demoCall(
    () => apiGet<SearchResponse>(path),
    () => ({ query, results: offlineSearch(query, limit) })
  );
  return { data: r.data.results, source: r.source };
}
