import 'server-only';

/**
 * Fixed-window rate limiter, in process memory.
 *
 * Honest about its limits: this is per-instance, so on a platform that runs
 * several serverless instances the effective budget multiplies by the instance
 * count, and it resets on cold start. It is a speed bump against a script
 * hammering the guess endpoint, not a defence against a distributed attacker.
 *
 * That is a deliberate trade rather than an oversight. A correct shared limiter
 * needs Redis (Upstash), which is another service to run, pay for and keep
 * available — and if it is unavailable you must then decide whether to fail open
 * (no protection) or closed (the game stops). For a daily word game the real
 * abuse ceiling is already low: guesses are validated against a signed token, so
 * brute force cannot bank a win, only waste bandwidth.
 *
 * Swap in @upstash/ratelimit here if this ever needs to be authoritative — the
 * call site takes a key and returns the same shape.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived instance. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter,
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
