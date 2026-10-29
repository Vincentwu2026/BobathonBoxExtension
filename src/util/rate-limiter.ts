/**
 * Rate Limiting and Retry Handling utility for Box API operations.
 * Implements exponential backoff with jitter and 429 Too Many Requests retry logic.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffFactor: 2,
};

/**
 * Checks whether an error is a rate limit (HTTP 429) or transient server error (HTTP 500, 502, 503, 504).
 */
export function isRateLimitOrTransientError(error: any): boolean {
  if (!error) return false;

  const statusCode =
    error.statusCode ||
    error.status ||
    error.response?.statusCode ||
    error.response?.status ||
    (error.message && /429|500|502|503|504/.test(error.message) ? 429 : undefined);

  if (statusCode === 429 || (statusCode >= 500 && statusCode <= 504)) {
    return true;
  }

  // Check Box SDK error structure
  if (error.response?.body?.code === 'rate_limit_exceeded') {
    return true;
  }

  return false;
}

/**
 * Extracts retry-after header value in milliseconds if present.
 */
export function getRetryAfterMs(error: any): number | null {
  const retryAfter =
    error?.response?.headers?.['retry-after'] ||
    error?.headers?.['retry-after'] ||
    error?.response?.headers?.['Retry-After'];

  if (retryAfter) {
    const seconds = Number.parseInt(String(retryAfter), 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  return null;
}

/**
 * Sleep helper utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an asynchronous operation with automatic rate limiting and exponential backoff retry.
 */
export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  operationName: string = 'Box API Operation'
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let delay = config.initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;

      if (attempt > config.maxRetries || !isRateLimitOrTransientError(error)) {
        throw error;
      }

      // Check for explicit Retry-After header
      const retryAfterMs = getRetryAfterMs(error);
      const waitTime = retryAfterMs !== null
        ? retryAfterMs
        : Math.min(delay * Math.pow(config.backoffFactor, attempt - 1), config.maxDelayMs);

      // Add 10-20% random jitter to avoid thundering herd problem
      const jitter = waitTime * (0.1 * Math.random());
      const totalWait = Math.round(waitTime + jitter);

      console.error(
        `[RateLimiter] ${operationName} encountered rate limit / transient error (Attempt ${attempt}/${config.maxRetries}). Retrying in ${totalWait}ms...`
      );

      await sleep(totalWait);
    }
  }
}
