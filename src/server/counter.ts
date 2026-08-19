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
import { sharedCount } from '@/server/sharedCounter';

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
   * A peek is served from memory even when Redis is configured.
   *
   * There is no read-only form of the script - it increments, that is what it
   * is for - and adding a second GET round trip to render a counter would put
   * network latency on a path whose only job is to display a number. A peek
   * that is occasionally low is a cosmetic inaccuracy; every decision that
   * matters goes through the consuming path.
   */
  if (consume) {
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
