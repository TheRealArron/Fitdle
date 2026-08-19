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
 * Best-effort client identity. Behind a proxy the first `x-forwarded-for` entry
 * is the client; the header is spoofable, which is another reason this is a
 * speed bump rather than a control.
 */
export function clientKey(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
