import { LIVE_UNAVAILABLE_MESSAGE } from '@/types';

/** The API answered with a structured error (validation, not found, Box unavailable, …). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/** The API could not be reached at all (not running, proxy failure, timeout, non-JSON reply). */
export class ApiUnreachableError extends Error {
  constructor() {
    super('The backend API is not reachable.');
    this.name = 'ApiUnreachableError';
  }
}

/** Live Box Mode cannot be served right now (auth missing/expired, Box unreachable, API down). */
export class LiveUnavailableError extends Error {
  constructor() {
    super(LIVE_UNAVAILABLE_MESSAGE);
    this.name = 'LiveUnavailableError';
  }
}

export function isLiveUnavailable(error: unknown): error is LiveUnavailableError {
  return error instanceof LiveUnavailableError;
}

/** Only structured API messages are safe to show; everything else gets a generic message. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'Something went wrong. Please try again.';
}
