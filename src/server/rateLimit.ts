import 'server-only';

/**
 * Fixed-window rate limiter.
 *
 * A fixed window over the shared counter in `counter.ts`, which is backed by
 * Redis when one is configured and by process memory when it is not. This file
 * does not know which, and must not: the whole reason the fallback lives in one
 * place is so no call site can get the decision wrong.
 */

import { count } from '@/server/counter';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
  /** True when the limit was enforced across instances rather than locally. */
  shared: boolean;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  /*
   * Fixed windows, not sliding: the window id is the period number, so every
   * caller in the same period shares a bucket. A burst can therefore straddle a
   * boundary and briefly get 2x the limit, which for a speed bump is fine and
   * far cheaper than tracking timestamps per key.
   */
  const window = Math.floor(now / windowMs);
  const resetsIn = Math.ceil((windowMs - (now % windowMs)) / 1000);

  const r = await count(key, limit, window, resetsIn);
  return {
    allowed: r.allowed,
    remaining: Math.max(0, limit - r.count),
    retryAfter: r.allowed ? 0 : r.retryAfter,
    shared: r.shared,
  };
}

/**
 * Client identity for every address-keyed control: rate limits, the anonymous
 * AI quota, and the anonymous opening-call record.
 *
 * ── Why not the first `x-forwarded-for` entry ──────────────────────────────
 * It used to be. The leftmost entry is whatever the CLIENT wrote: a proxy
 * appends the address it saw to the right of anything already there. So on any
 * host that does not overwrite the header, a random value per request was a
 * fresh rate-limit window, a fresh anonymous AI quota, and a fresh opening call
 * - the sweep `callRecord.ts` closes, reopened by one header.
 *
 * So:
 *   - On Vercel, the platform sets `x-real-ip` itself and the client cannot
 *     influence it. Use that.
 *   - Elsewhere, count `FITDLE_TRUSTED_PROXY_HOPS` (default 1) entries in from
 *     the RIGHT. That entry was written by your own outermost proxy, so it is
 *     the address that proxy actually saw. Set it to the number of proxies you
 *     run in front of the app (nginx alone: 1; a CDN then nginx: 2).
 *   - Set it to 0 only when nothing sits in front of `next start`. Then no
 *     header can be trusted and Route Handlers cannot see the socket address,
 *     so every caller shares one key - strict, but not spoofable.
 *
 * The result is length-capped because it becomes a map and Redis key.
 */
export function clientKey(request: Request): string {
  const cap = (v: string) => v.trim().slice(0, 64) || 'unknown';

  if (process.env.VERCEL) {
    const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-vercel-forwarded-for');
    if (ip) return cap(ip.split(',')[0]);
  }

  const hops = trustedHops();
  if (hops === 0) return 'unknown';

  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const entries = fwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (entries.length > 0) return cap(entries[Math.max(0, entries.length - hops)]);
  }
  return cap(request.headers.get('x-real-ip') ?? 'unknown');
}

function trustedHops(): number {
  const raw = process.env.FITDLE_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}
