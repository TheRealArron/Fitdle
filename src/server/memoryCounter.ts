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
}

const buckets = new Map<string, Bucket>();

/**
 * Entries are only dropped when the map is big enough for it to matter. Under
 * that, sweeping costs more than the memory it reclaims.
 */
const SWEEP_ABOVE = 5_000;
let lastSweep = 0;

function maybeSweep(currentWindow: number): void {
  if (buckets.size < SWEEP_ABOVE) return;
  // At most once a minute; a sweep is O(n) and the map only grows slowly.
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;

  for (const [key, bucket] of buckets) {
    if (bucket.window < currentWindow) buckets.delete(key);
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
  maybeSweep(window);

  const existing = buckets.get(key);
  const current = existing && existing.window === window ? existing.count : 0;

  if (current >= limit) {
    return { allowed: false, count: current, limit, retryAfter: resetsIn };
  }

  if (consume) buckets.set(key, { window, count: current + 1 });

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
