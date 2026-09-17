import 'server-only';

/**
 * The counter, shared across instances, when one is configured.
 *
 * `memoryCounter.ts` says its limits multiply by the instance count and reset
 * on a cold start, and names itself as the single seam to fix that. This is
 * that fix: an Upstash Redis counter behind the same shape, so every caller
 * inherits a real limit without knowing where it lives.
 *
 * ── Why the REST API and not a Redis client ─────────────────────────────────
 * A TCP connection pool is the wrong shape for a serverless function that may
 * be frozen between requests and may never run the same instance twice.
 * Upstash's REST endpoint is a plain HTTPS request, so it needs no pool, no
 * reconnect logic, and no cleanup - and `fetch` is already there.
 *
 * ── Why one Lua script and not INCR then EXPIRE ─────────────────────────────
 * The obvious version is two commands, and both ways of writing it are wrong:
 *
 *   INCR, then EXPIRE every time  - each request pushes the expiry out, so a
 *                                   key under steady load never expires and the
 *                                   window stops being a window.
 *   INCR, then EXPIRE if count==1 - correct, but the decision is made on the
 *                                   client between two round trips, so two
 *                                   requests racing on a fresh key can both see
 *                                   1 and neither may set the expiry.
 *
 * Redis runs a script atomically, so doing the test inside it is both correct
 * and a single round trip - which matters, because this runs before every
 * rate-limited request and its latency is added to all of them.
 */

/**
 * Increment, and set the expiry only when the key is new.
 *
 * KEYS[1] the counter, ARGV[1] the window in seconds. Returns the new count.
 */
const INCREMENT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`.trim();

/**
 * Write a value only if the key is free, and return whichever value stands.
 *
 * KEYS[1] the key, ARGV[1] the value to write, ARGV[2] the TTL in seconds.
 *
 * `SET NX` then `GET` would be two round trips, and between them another
 * instance can win the key - so the caller that lost would read its own value
 * back from a stale local variable rather than the one that actually stands.
 * Inside a script the write and the read-back are one atomic step, and the
 * return value is always the winner. That is the entire property this needs:
 * first writer wins, everyone else is told who won.
 */
const SET_IF_ABSENT = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then
  return ARGV[1]
end
return redis.call('GET', KEYS[1])
`.trim();

/** Never let a limiter's own latency become the outage it was meant to prevent. */
const TIMEOUT_MS = 1_000;

interface Config {
  url: string;
  token: string;
}

function config(): Config | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  // Both or neither. Half-configured is a deployment mistake, and silently
  // running unlimited because one variable was missed is how it stays unnoticed.
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** True when a shared counter is configured. For diagnostics and tests. */
export function sharedCounterConfigured(): boolean {
  return config() !== null;
}

/**
 * Runs one Lua script on the shared Redis, or returns null if there is none to
 * run it on. Null means "no answer", NOT a result - every caller falls back.
 *
 * Two scripts go through here now, so the transport is written once. The
 * fail-open rule and the timeout belong to the transport rather than to either
 * script, which is why they live here.
 */
async function evalScript(script: string, key: string, args: string[]): Promise<unknown> {
  const cfg = config();
  if (!cfg) return null;

  try {
    const response = await fetch(`${cfg.url}/eval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      // [script, numberOfKeys, ...keys, ...args]
      body: JSON.stringify([script, 1, key, ...args]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[sharedCounter] upstash responded', response.status);
      return null;
    }

    const body = (await response.json()) as { result?: unknown; error?: string };
    if (body.error) {
      console.error('[sharedCounter]', body.error);
      return null;
    }
    return body.result ?? null;
  } catch (err) {
    // Includes the timeout above. Logged once, not thrown: see fail-open.
    console.error('[sharedCounter] unreachable:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Counts one event in a shared window.
 *
 * Returns the new count, or `null` when there is no shared counter to use or it
 * could not be reached. Null means "no answer", NOT "zero" - the caller must
 * fall back rather than treat it as an allowance.
 *
 * ── It fails OPEN, deliberately ─────────────────────────────────────────────
 * If Redis is down, requests fall back to the in-process counter rather than
 * being rejected. The alternative is that an outage in the thing that limits
 * abuse becomes an outage of the whole game. These limits guard against noisy
 * traffic, not against loss - the guess API is protected by a signed token, and
 * the money-spending AI quota has a durable counter in Postgres.
 */
export async function sharedCount(key: string, windowSeconds: number): Promise<number | null> {
  const result = await evalScript(INCREMENT, key, [String(windowSeconds)]);
  if (result === null) return null;

  const n = Number(result);
  // A non-numeric result means the contract changed under us. Falling back is
  // safer than trusting a value we did not expect.
  return Number.isFinite(n) ? n : null;
}

/**
 * Claims `key` for `value`, first writer wins.
 *
 * Returns the value that stands - `value` if this caller won the key, the
 * earlier one if somebody else did. Returns null when there is no shared store
 * or it could not be reached, which the caller must treat as "no answer" and
 * fall back on, never as "the key was free".
 */
export async function sharedSetIfAbsent(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<string | null> {
  const result = await evalScript(SET_IF_ABSENT, key, [value, String(Math.max(1, ttlSeconds))]);
  return typeof result === 'string' && result.length > 0 ? result : null;
}

/** Exported so a test can assert the script does its own expiry decision. */
export const INCREMENT_SCRIPT = INCREMENT;

/** Exported so a test can assert first-writer-wins is decided inside Redis. */
export const SET_IF_ABSENT_SCRIPT = SET_IF_ABSENT;
