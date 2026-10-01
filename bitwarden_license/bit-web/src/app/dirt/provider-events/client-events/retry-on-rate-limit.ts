import { HttpStatusCode } from "@bitwarden/common/enums";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

/** Backoff between retries of a rate-limited request: 2s, 4s, 8s, 16s, then 30s. */
export const RATE_LIMIT_BACKOFF_MS: readonly number[] = Object.freeze([
  2000, 4000, 8000, 16000, 30000,
]);

export type RetryOnRateLimitOptions = {
  /** Retries after the first attempt. The last 429 is rethrown once they're used up. */
  maxRetries: number;
  /** Delay before each retry; the last entry repeats if there are more retries than entries. */
  backoffMs?: readonly number[];
  /**
   * Reads a server-provided wait (a `Retry-After` header) from the error, in milliseconds. When it
   * returns a number it's used instead of the backoff. `ApiService` doesn't expose response
   * headers today, so callers can't supply this yet.
   */
  retryAfterMs?: (error: unknown) => number | undefined;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export function isRateLimitError(error: unknown): boolean {
  return error instanceof ErrorResponse && error.statusCode === HttpStatusCode.TooManyRequests;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `request`, and on a 429 waits and runs it again (the same request, so the same
 * continuation token), up to `maxRetries` times. Any other error is rethrown immediately.
 */
export async function retryOnRateLimit<T>(
  request: () => Promise<T>,
  options: RetryOnRateLimitOptions,
): Promise<T> {
  const backoffMs = options.backoffMs ?? RATE_LIMIT_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let retry = 0; ; retry++) {
    try {
      return await request();
    } catch (e) {
      if (!isRateLimitError(e) || retry >= options.maxRetries) {
        throw e;
      }
      const delay = options.retryAfterMs?.(e) ?? backoffMs[Math.min(retry, backoffMs.length - 1)];
      await sleep(delay);
    }
  }
}
