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

/** Only structured API messages are safe to show; everything else gets a generic message. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof ApiUnreachableError) return "Can't reach the app's server. Start it with: npm run web-api";
  return 'Something went wrong. Please try again.';
}
