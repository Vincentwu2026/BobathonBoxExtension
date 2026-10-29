import { apiGet, apiPost } from '@/lib/http';
import { demoCall, liveCall, type Result } from '@/services/shared';
import { offlineDeleteAttempt, offlineDocument } from '@/services/offlineDemo';
import { ApiRequestError } from '@/services/errors';
import type { DeleteAttempt, DocumentItem, Mode } from '@/types';

export function getDocument(mode: Mode, id: string): Promise<Result<DocumentItem>> {
  const path = `/${mode}/documents/${encodeURIComponent(id)}`;
  if (mode === 'live') return liveCall(() => apiGet<DocumentItem>(path));
  return demoCall(
    () => apiGet<DocumentItem>(path),
    () => {
      const doc = offlineDocument(id);
      if (!doc) throw new ApiRequestError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
      return doc;
    }
  );
}

/**
 * Attempts a deletion. This is always a dry run: the backend evaluates the retention rules,
 * records the decision in the audit log, and never deletes anything (in either mode).
 */
export function attemptDelete(mode: Mode, id: string): Promise<Result<DeleteAttempt>> {
  const path = `/${mode}/documents/${encodeURIComponent(id)}/delete-attempt`;
  if (mode === 'live') return liveCall(() => apiPost<DeleteAttempt>(path));
  return demoCall(
    () => apiPost<DeleteAttempt>(path),
    () => {
      const result = offlineDeleteAttempt(id);
      if (!result) throw new ApiRequestError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
      return result;
    }
  );
}
