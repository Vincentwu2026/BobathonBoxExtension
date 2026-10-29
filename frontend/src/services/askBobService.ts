import { apiPost } from '@/lib/http';
import type { AskBobResponse, Mode } from '@/types';

/**
 * Asks Bob a question about one file. The server reads the file itself and holds the Bob API key;
 * the browser only sends the question and, optionally, the search the user just ran.
 */
export function askBob(mode: Mode, id: string, question: string, searchQuery?: string): Promise<AskBobResponse> {
  const path = `/${mode}/documents/${encodeURIComponent(id)}/ask`;
  return apiPost<AskBobResponse>(path, 150_000, { question, ...(searchQuery ? { searchQuery } : {}) });
}
