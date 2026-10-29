import { ApiRequestError, ApiUnreachableError } from '@/services/errors';

const BASE = '/api';

interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

async function request<T>(method: 'GET' | 'POST', path: string, timeoutMs: number, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: {
        Accept: 'application/json',
        // The API rejects POSTs without this header, which forces a CORS preflight for any
        // cross-origin caller. Same-origin calls through the Vite proxy are unaffected.
        ...(method === 'POST' ? { 'x-bps-client': 'web' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (res.ok) {
      // A 200 that is not JSON means something other than our API answered.
      if (parsed === null) throw new ApiUnreachableError();
      return parsed as T;
    }

    const err = (parsed as ErrorBody | null)?.error;
    if (err && typeof err.code === 'string' && typeof err.message === 'string') {
      throw new ApiRequestError(res.status, err.code, err.message);
    }
    // e.g. the Vite dev proxy answering 500 because the API is down.
    throw new ApiUnreachableError();
  } catch (e) {
    if (e instanceof ApiRequestError || e instanceof ApiUnreachableError) throw e;
    throw new ApiUnreachableError();
  } finally {
    clearTimeout(timer);
  }
}

export function apiGet<T>(path: string, timeoutMs = 20_000): Promise<T> {
  return request<T>('GET', path, timeoutMs);
}

export function apiPost<T>(path: string, timeoutMs = 20_000, body?: unknown): Promise<T> {
  return request<T>('POST', path, timeoutMs, body);
}
