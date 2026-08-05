
/**
 * A clock the player does not control.
 *
 * This used to be the anti-cheat: `highSeed` blocked winding the clock BACK,
 * and this blocked winding it FORWARD to play tomorrow early.
 *
 * It is no longer load-bearing for that. `/api/today` computes the seed on the
 * server, so which puzzle you get is not the browser's decision at all - a
 * wound-forward clock changes nothing. What remains is presentation: the
 * countdown to the next puzzle, and noticing when a tab has been open across
 * UTC midnight.
 *
 * The offset is fed from the `serverTime` that every API response already
 * carries. It previously made its own Supabase RPC call, which was a second
 * mechanism for the same job, an extra thing to install, and a 404 in the
 * console for anyone who had not run the newer schema.
 */

/*
 * The offset lives on globalThis, not in a module-scoped `let`.
 *
 * `syncTrustedTime` is called from a component while `trustedNow` is called
 * from lib/daily, which is reached through the store and through a dynamically
 * imported chunk. If the bundler emits this module into more than one chunk,
 * module-scoped state gives each copy its own `offsetMs` - the writer sets one
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
 * Deduplicated: concurrent callers share one request. Never throws - a failure
 * leaves the offset at zero, which is the local clock, which is the honest
 * fallback.
 */
/**
 * Adopts the server's clock from an API response.
 *
 * Cheap and idempotent - called on every `/api/today` and `/api/guess`, so the
 * offset self-corrects if the machine sleeps or the clock is changed mid-game.
 */
export function adoptServerTime(iso: string): void {
  const serverMs = new Date(iso).getTime();
  if (!Number.isFinite(serverMs)) return;
  const st = state();
  st.offsetMs = serverMs - Date.now();
  st.synced = true;
}

/** Test seam. */
export function __setOffsetForTests(ms: number, isSynced = true): void {
  const s = state();
  s.offsetMs = ms;
  s.synced = isSynced;
}
