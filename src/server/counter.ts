import 'server-only';

/**
 * The one counter every limit goes through.
 *
 * Two implementations sit behind it: a shared Redis counter when one is
 * configured, and the in-process map when it is not. Callers do not choose -
 * that is the point. A rate limiter that has to know whether Redis exists ends
 * up with the decision copied into every call site, and then one of them is
 * wrong.
 *
 * ── What changes when Redis is configured ───────────────────────────────────
 * Nothing, from a caller's perspective, except that the limit becomes true.
 * Without it, every limit is per-instance: run four serverless instances and
 * "20 per minute" is 80, and all four reset on a cold start. With it, 20 means
 * 20 across the fleet and it survives restarts.
 *
 * Both paths are live in production. Redis is the answer when it replies, and
 * the in-process counter is what answers when it does not - so a Redis outage
 * degrades the limit back to what it was before, rather than removing it.
 */

import { count as memoryCount, type CountResult } from '@/server/memoryCounter';
import { sharedCount, sharedPeek } from '@/server/sharedCounter';

export interface CountOutcome extends CountResult {
  /** True when the answer came from the shared counter rather than memory. */
  shared: boolean;
}

/**
 * Counts one event against a limit, within a window.
 *
 * `window` identifies the bucket, `resetsIn` is seconds until it rolls (used
 * for `Retry-After`, and as the Redis key's TTL). `consume: false` reads
 * without spending.
 */
export async function count(
  key: string,
  limit: number,
  window: number,
  resetsIn: number,
  consume = true,
): Promise<CountOutcome> {
  /*
   * A peek reads Redis too when it is configured.
   *
   * It used to be served from memory on the theory that a peek only renders a
   * number. That stopped being true when `guessesSpent` became a peek the guess
   * route decides with: in Redis mode the consuming path never touches memory,
   * so the peek read 0 for every player, every day, and a signed-in player who
   * discarded their token was shown a fresh board for a round they had lost.
   */
  if (!consume) {
    const n = await sharedPeek(`${key}:${window}`);
    if (n !== null) {
      return { allowed: n < limit, count: n, limit, retryAfter: resetsIn, shared: true };
    }
  } else {
    /*
     * The Redis key carries the window id, so expiry and correctness come from
     * the same value: a new window is a new key, and the old one dies on its
     * own TTL. Nothing has to sweep.
     */
    const n = await sharedCount(`${key}:${window}`, Math.max(1, resetsIn));
    if (n !== null) {
      return {
        // The Nth request is allowed when N is within the limit. Redis has
        // already counted it, so this reads `<=` where a pre-check reads `<`.
        allowed: n <= limit,
        count: n,
        limit,
        retryAfter: resetsIn,
        shared: true,
      };
    }
  }

  return { ...memoryCount(key, limit, window, resetsIn, consume), shared: false };
}

export { secondsUntilUtcMidnight, utcDay } from '@/server/memoryCounter';
