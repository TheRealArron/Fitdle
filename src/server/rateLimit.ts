import 'server-only';

/**
 * Fixed-window rate limiter, in process memory.
 *
 * A fixed window over the shared in-process counter. The per-instance caveat
 * and the Redis escape hatch are documented once, in `memoryCounter.ts` - this
 * is one caller of it rather than its own hand-rolled Map.
 */

import { count } from '@/server/memoryCounter';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  /*
   * Fixed windows, not sliding: the window id is the period number, so every
   * caller in the same period shares a bucket. A burst can therefore straddle a
   * boundary and briefly get 2x the limit, which for a speed bump is fine and
   * far cheaper than tracking timestamps per key.
   */
  const window = Math.floor(now / windowMs);
  const resetsIn = Math.ceil((windowMs - (now % windowMs)) / 1000);

  const r = count(key, limit, window, resetsIn);
  return {
    allowed: r.allowed,
    remaining: Math.max(0, limit - r.count),
    retryAfter: r.allowed ? 0 : r.retryAfter,
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
