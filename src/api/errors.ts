/**
 * Errors surfaced by the web UI API. Messages here are safe to return to the browser;
 * raw SDK errors are logged server-side only and never forwarded.
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const BOX_UNAVAILABLE_MESSAGE = 'Live Box connection unavailable. Please switch to Demo Mode.';

/**
 * Maps any error thrown by the Box SDK / auth layer to a generic, safe ApiError.
 *
 * Authentication problems (missing credentials, expired developer token, 401, network
 * failures, timeouts) all collapse into BOX_UNAVAILABLE so the UI can show a single
 * "switch to Demo Mode" message without crashing.
 */
export function classifyBoxError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const anyErr = err as {
    message?: unknown;
    statusCode?: unknown;
    responseInfo?: { statusCode?: unknown };
  } | null;
  const status = Number(anyErr?.responseInfo?.statusCode ?? anyErr?.statusCode ?? 0);
  const message = String(anyErr?.message ?? 'unknown error');

  // Server-side log only: message text, never the token or request headers.
  console.error(`[WebApi] Box call failed (status ${status || 'n/a'}): ${message}`);

  if (status === 404) {
    return new ApiError(404, 'NOT_FOUND', 'The Box item was not found or is not accessible to the connected account.');
  }
  if (status === 403) {
    return new ApiError(403, 'FORBIDDEN', 'The connected Box account does not have access to this item.');
  }
  if (status === 429) {
    return new ApiError(429, 'RATE_LIMITED', 'Box is rate limiting requests. Please retry shortly.');
  }
  return new ApiError(503, 'BOX_UNAVAILABLE', BOX_UNAVAILABLE_MESSAGE);
}
