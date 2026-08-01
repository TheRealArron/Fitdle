import { isCloudConfigured } from '@/lib/supabase';

/**
 * A clock the player does not control.
 *
 * `highSeed` already stops someone winding the clock BACK to farm old puzzles.
 * It cannot stop them winding it FORWARD to play tomorrow early — that just
 * looks like time passing, which is exactly what a monotonic high-water mark is
 * built to allow.
 *
 * The fix needs a time source outside the browser, and the Supabase project is
 * already configured, so it is the natural one.
 *
 * The obvious implementation — read the `Date` response header off any Supabase
 * call — DOES NOT WORK, and it fails silently, which is worse. `Date` is not on
 * the CORS-safelist for response headers, so `res.headers.get('date')` returns
 * null cross-origin even though curl can see the header perfectly well. It was
 * built that way first and the clock-skew test caught it.
 *
 * So the time arrives in the response BODY, from a tiny `stable` SQL function
 * (`fitdle_server_time`) defined in supabase/schema.sql.
 *
 * The offset is applied everywhere the daily seed is computed. If the server is
 * unreachable the app falls back to the local clock and says so, because
 * refusing to run offline would be a worse failure than an honest one.
 */

/*
 * The offset lives on globalThis, not in a module-scoped `let`.
 *
 * `syncTrustedTime` is called from a component while `trustedNow` is called
 * from lib/daily, which is reached through the store and through a dynamically
 * imported chunk. If the bundler emits this module into more than one chunk,
 * module-scoped state gives each copy its own `offsetMs` — the writer sets one
 * and the reader sees the other, so the correction silently never applies.
 * A single global slot cannot be duplicated, and it doubles as a probe point.
 */
interface TimeState {
  offsetMs: number;
  synced: boolean;
  inFlight: Promise<boolean> | null;
}

const KEY = '__fitdleTrustedTime' as const;
const g = globalThis as unknown as Record<string, TimeState | undefined>;

function state(): TimeState {
  if (!g[KEY]) g[KEY] = { offsetMs: 0, synced: false, inFlight: null };
  return g[KEY];
}

export interface TimeStatus {
  /** True once a server time has been obtained at least once this session. */
  synced: boolean;
  /** serverTime - localTime, in ms. Positive means the local clock is behind. */
  offsetMs: number;
  /** Local clock is more than a day off. Almost always deliberate. */
  suspicious: boolean;
}

const DAY_MS = 86_400_000;

export function timeStatus(): TimeStatus {
  const s = state();
  return { synced: s.synced, offsetMs: s.offsetMs, suspicious: s.synced && Math.abs(s.offsetMs) > DAY_MS };
}

/** The current time, corrected against the server when we have an offset. */
export function trustedNow(): Date {
  return new Date(Date.now() + state().offsetMs);
}

/**
 * Fetches the server clock once and caches the offset.
 *
 * Deduplicated: concurrent callers share one request. Never throws — a failure
 * leaves the offset at zero, which is the local clock, which is the honest
 * fallback.
 */
export function syncTrustedTime(): Promise<boolean> {
  const st = state();
  if (st.inFlight) return st.inFlight;
  if (!isCloudConfigured() || typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Promise.resolve(false);

  st.inFlight = (async () => {
    try {
      // Round-trip time is halved out of the estimate. Sub-second accuracy is
      // irrelevant here — we only care which UTC day it is.
      const sentAt = Date.now();
      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/fitdle_server_time`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
      });
      // 404 means the project is on an older schema without the function.
      if (!res.ok) return false;

      // PostgREST returns a bare JSON string for a scalar-returning function.
      const body: unknown = await res.json();
      const iso = typeof body === 'string' ? body : null;
      if (!iso) return false;

      const serverMs = new Date(iso).getTime();
      if (!Number.isFinite(serverMs)) return false;

      const latency = (Date.now() - sentAt) / 2;
      st.offsetMs = serverMs + latency - Date.now();
      st.synced = true;
      return true;
    } catch {
      return false;
    } finally {
      st.inFlight = null;
    }
  })();

  return st.inFlight;
}

/** Test seam. */
export function __setOffsetForTests(ms: number, isSynced = true): void {
  const s = state();
  s.offsetMs = ms;
  s.synced = isSynced;
}
