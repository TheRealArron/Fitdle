import 'server-only';

/**
 * The day's opening call, remembered by the server.
 *
 * ── The hole this closes ────────────────────────────────────────────────────
 * The call used to live only in the signed session token, and `/api/call`
 * refused a second call only when the token you sent it already carried one.
 * So a client that simply did not send a token was always making a first call.
 * Seven requests - one per muscle group - and the response told you which one
 * was right and handed over the equipment hint, with none of the forfeit the
 * mechanic exists to price.
 *
 * Measured before the fix, averaged over all 62 scheduled answers: knowing the
 * length leaves 19.8 catalogue candidates, + the group 4.3, + the equipment
 * 2.7 - and on 27 of the 62 days, exactly one. That is not a hint, it is the
 * answer at guess zero.
 *
 * ── Why a value and not a count ─────────────────────────────────────────────
 * `counter.ts` could have answered "has this player called yet?" with a limit
 * of one. That closes the sweep but breaks the honest case: a player who calls
 * and then loses their token - cleared storage, a new tab, a crashed phone -
 * would be refused and would lose a call they had already paid for.
 *
 * Storing WHICH group was called makes the endpoint idempotent instead. Call
 * the same group again and you get your own outcome back. Call a different one
 * and you are told which one stands, with no outcome for the new group, so a
 * sweep learns nothing after its first request.
 *
 * ── What it does not close ──────────────────────────────────────────────────
 * The record is keyed by the caller, and for an anonymous player the only
 * identity available is an address. Rotating addresses therefore still buys
 * fresh calls, exactly as it buys fresh rate-limit windows. Signed-in players
 * are keyed by their verified user id and are not affected by either.
 *
 * With no Redis configured the record lives in this process, so a multi-
 * instance deployment gives one free call per instance. Both are the same trade
 * `memoryCounter.ts` already documents, and both are why this is described as
 * closing a sweep rather than as making the call unforgeable.
 *
 * It fails OPEN: if the shared store cannot be reached the request falls back
 * to the in-process record rather than being refused. Losing the opening call
 * because Redis blinked would be a worse outcome than the sweep it prevents.
 */

import { secondsUntilUtcMidnight } from '@/server/memoryCounter';
import { sharedSetIfAbsent } from '@/server/sharedCounter';

/**
 * Lazy expiry, same rule as `memoryCounter`: a record from an earlier seed
 * reads as absent rather than needing a sweep. The map is swept only once it is
 * big enough for the memory to matter.
 */
interface Record_ {
  seed: number;
  group: string;
}

const records = new Map<string, Record_>();
const SWEEP_ABOVE = 5_000;
let lastSweep = 0;

function maybeSweep(seed: number): void {
  if (records.size < SWEEP_ABOVE) return;
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, record] of records) {
    if (record.seed < seed) records.delete(key);
  }
}

function rememberLocally(key: string, seed: number, group: string): string {
  maybeSweep(seed);
  const existing = records.get(key);
  if (existing && existing.seed === seed) return existing.group;
  records.set(key, { seed, group });
  return group;
}

/**
 * Records `group` as this caller's call for `seed`, first call wins.
 *
 * Returns the group that stands: `group` when this was the first call, the
 * earlier one when it was not. The caller compares the two - equal means
 * proceed, different means refuse and name the one that stands.
 *
 * `owner` must identify the caller, not the session: a session token is
 * discardable, which is the whole reason this exists.
 */
export async function recordCall(owner: string, seed: number, group: string): Promise<string> {
  const key = `call:${seed}:${owner}`;
  const shared = await sharedSetIfAbsent(key, group, secondsUntilUtcMidnight());

  /*
   * The local record is written either way, so the two agree if Redis
   * disappears mid-day. Writing it second means the shared answer wins when
   * there is one, and the local one is only consulted when there is not.
   */
  const local = rememberLocally(key, seed, shared ?? group);
  return shared ?? local;
}

/** Test seam: forget everything. Never called by the application. */
export function resetCallRecords(): void {
  records.clear();
}
