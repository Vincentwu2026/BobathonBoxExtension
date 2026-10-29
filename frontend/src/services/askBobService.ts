import { apiPost } from '@/lib/http';
import type { AskBobResponse } from '@/types';

/**
 * Asks Bob a question about one demo file. The server reads the file itself and holds the Bob API key;
 * the browser only sends the question and, optionally, the search the user just ran.
 */
export function askBob(id: string, question: string, searchQuery?: string): Promise<AskBobResponse> {
  const path = `/demo/documents/${encodeURIComponent(id)}/ask`;
  return apiPost<AskBobResponse>(path, 150_000, { question, ...(searchQuery ? { searchQuery } : {}) });
}
