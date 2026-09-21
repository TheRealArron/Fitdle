import 'server-only';

/**
 * The one in-process counter, used by everything that needs to count.
 *
 * Rate limiting, the global AI budget and the anonymous quota were three
 * separate `Map`s with three hand-rolled expiry rules and three copies of the
 * same caveat. Same shape, same failure mode, three places to fix a bug and
 * three places to forget one.
 *
 * ┌─ The caveat, stated once ─────────────────────────────────────────────────┐
 * │ This lives in the process. On a platform that runs several serverless      │
 * │ instances, every limit built on it multiplies by the instance count, and   │
 * │ all of them reset on a cold start.                                        │
 * │                                                                          │
 * │ That is a deliberate trade rather than an oversight. A correct shared     │
 * │ counter needs Redis, which is another service to run, pay for and keep    │
 * │ available - and when it is unavailable you must choose between failing    │
 * │ open (no protection) and failing closed (the app stops). For a daily word │
 * │ game the abuse ceiling is already low: guesses are validated against a    │
 * │ signed token, so brute force cannot bank a win, and the durable AI quota  │
 * │ for signed-in players is in Postgres precisely because it guards money.   │
 * │                                                                          │
 * │ Everything here is a SPEED BUMP. If one ever needs to be authoritative,   │
 * │ this module is the single seam - swap the Map for Upstash and every       │
 * │ caller inherits it.                                                      │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Expiry is lazy: an entry from a previous window reads as zero rather than
 * needing a sweep. That keeps it allocation-light, but a key that is never
 * touched again is never collected - so `sweep()` runs opportunistically to
 * stop a long-lived process accumulating one entry per address seen, forever.
 */

interface Bucket {
  /** Window identifier - a day number, or a fixed-window start timestamp. */
  window: number;
  count: number;
  /** Wall-clock ms after which this bucket is certainly stale. */
  expiresAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Entries are only dropped when the map is big enough for it to matter. Under
 * that, sweeping costs more than the memory it reclaims.
 */
const SWEEP_ABOVE = 5_000;
let lastSweep = 0;

/**
 * Drops buckets that have certainly expired, by WALL CLOCK.
 *
 * ── Why not by window id, which is what this used to do ─────────────────────
 * A window id only means something next to another id of the same period, and
 * this map holds three periods at once:
 *
 *     utcDay   ~20,717        the AI budget and the anonymous AI quota
 *     seed     ~20,260,921    the per-account guess floor (YYYYMMDD)
 *     minute   ~29,833,266    every rate limit
 *
 * The sweep compared `bucket.window < currentWindow` across all of them. A
 * sweep triggered by a rate-limit call therefore deleted every day-scoped and
 * seed-scoped bucket in the map, because their ids are numerically smaller -
 * live ones included.
 *
 * Measured before the fix: spend 3 of the day's AI budget, then make 5,100
 * rate-limited requests from distinct addresses, and `budget:coach` reads **0
 * used**. The global spend cap in `aiBudget.ts` exists to stop a busy day
 * becoming a surprise invoice, and the exact condition that produces a busy day
 * - thousands of distinct addresses - is what reset it.
 *
 * `resetsIn` is already passed by every caller and already means "seconds until
 * this bucket rolls", so an absolute expiry needs no new argument and is
 * comparable across every period. Lazy expiry on read is still what makes the
 * counting correct; this is only about reclaiming memory.
 */
function maybeSweep(): void {
  if (buckets.size < SWEEP_ABOVE) return;
  // At most once a minute; a sweep is O(n) and the map only grows slowly.
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;

  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
}

export interface CountResult {
  /** False once the limit is reached. */
  allowed: boolean;
  count: number;
  limit: number;
  /** Seconds until this window rolls over. */
  retryAfter: number;
}

/**
 * Counts one event against a limit, within a window.
 *
 * `window` identifies the bucket - callers derive it from whatever their period
 * is - and `resetsIn` is how long until it rolls, used only for `Retry-After`.
 * Passing `consume: false` reads without spending, for rendering a counter.
 */
export function count(
  key: string,
  limit: number,
  window: number,
  resetsIn: number,
  consume = true,
): CountResult {
  maybeSweep();

  const existing = buckets.get(key);
  const current = existing && existing.window === window ? existing.count : 0;

  if (current >= limit) {
    return { allowed: false, count: current, limit, retryAfter: resetsIn };
  }

  /*
   * Recomputed on every write from the caller's own `resetsIn`, which always
   * counts down to the same boundary - so the expiry converges on it rather
   * than being pushed out, which is the mistake the Redis script documents.
   */
  if (consume) {
    buckets.set(key, { window, count: current + 1, expiresAt: Date.now() + resetsIn * 1000 });
  }

  const now = consume ? current + 1 : current;
  return { allowed: true, count: now, limit, retryAfter: resetsIn };
}

/** UTC day number. Used by anything whose period is "a day". */
export function utcDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** Seconds remaining in the current UTC day. */
export function secondsUntilUtcMidnight(): number {
  return Math.ceil(86_400 - ((Date.now() / 1000) % 86_400));
}
