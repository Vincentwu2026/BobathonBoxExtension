import type { DataSource } from '@/types';
import { ApiRequestError, ApiUnreachableError, LiveUnavailableError } from '@/services/errors';

export interface Result<T> {
  data: T;
  source: DataSource;
}

/**
 * Live Mode call. If the API is down, or the API reports that Box is unavailable
 * (missing/expired credentials, network failure), it becomes a single LiveUnavailableError
 * that the UI renders as "switch to Demo Mode" instead of crashing.
 */
export async function liveCall<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn(), source: 'api' };
  } catch (e) {
    if (e instanceof ApiUnreachableError) throw new LiveUnavailableError();
    if (e instanceof ApiRequestError && e.code === 'BOX_UNAVAILABLE') throw new LiveUnavailableError();
    throw e;
  }
}

/**
 * Demo Mode call. Prefers the backend (real SQLite FTS5 index). If the backend is not
 * running, falls back to the copy of the seeded data bundled into the app, so Demo Mode
 * works with `npm run dev` alone. Structured API errors (400/404) are not masked.
 */
export async function demoCall<T>(apiFn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { data: await apiFn(), source: 'api' };
  } catch (e) {
    if (e instanceof ApiUnreachableError) return { data: await fallback(), source: 'bundled' };
    throw e;
  }
}
