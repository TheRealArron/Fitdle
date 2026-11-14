import { MAX_GUESSES } from '@/data/exercises';
import { getSupabase } from '@/lib/supabase';
import { isCoherent, normalise, type SaveData } from '@/lib/secureStorage';

const TABLE = 'fitdle_progress';

/**
 * Merges a local save with a cloud save.
 *
 * Two devices played offline; both are legitimate. There is no timestamp we can
 * trust (the clock is the player's), so the merge is defined purely on the data:
 *
 *   - Monotonic counters take the MAX. You cannot un-play a game, so the larger
 *     count is the more complete history.
 *   - `highSeed` takes the max, preserving clock-rollback protection across
 *     devices - syncing must never hand back a lower high-water mark.
 *   - The streak comes from whichever save has played more recently
 *     (`lastSeed`), because a streak is only meaningful with its anchor. Taking
 *     the max streak instead would let a stale device resurrect a broken streak.
 *   - The in-progress board comes from the more recent day, so picking up your
 *     phone mid-puzzle does not wipe the rows you typed on your laptop.
 *
 * The result is deterministic and order-independent: merge(a,b) === merge(b,a).
 */
export function mergeSaves(a: SaveData, b: SaveData): SaveData {
  const aSeed = a.lastSeed ?? -1;
  const bSeed = b.lastSeed ?? -1;
  // Ties break on `played` so the merge stays deterministic either way round.
  const recent = aSeed > bSeed ? a : bSeed > aSeed ? b : a.played >= b.played ? a : b;
  const other = recent === a ? b : a;

  const distribution = Array.from({ length: MAX_GUESSES }, (_, i) =>
    Math.max(a.distribution[i] ?? 0, b.distribution[i] ?? 0),
  );

  const played = Math.max(a.played, b.played);
  const wins = Math.min(Math.max(a.wins, b.wins), played);
  const distTotal = distribution.reduce((s, n) => s + n, 0);

  // The coherence check requires distribution to sum to wins exactly. Max-ing
  // per bucket can overshoot, so reconcile by trimming the largest buckets.
  if (distTotal > wins) {
    let excess = distTotal - wins;
    for (let i = distribution.length - 1; i >= 0 && excess > 0; i--) {
      const take = Math.min(distribution[i], excess);
      distribution[i] -= take;
      excess -= take;
    }
  } else if (distTotal < wins) {
    distribution[Math.min(2, MAX_GUESSES - 1)] += wins - distTotal;
  }

  const streak = Math.min(recent.streak, wins);

  return {
    version: recent.version,
    played,
    wins,
    distribution,
    streak,
    maxStreak: Math.max(a.maxStreak, b.maxStreak, streak),
    lastSeed: recent.lastSeed,
    lastResult: recent.lastResult,
    highSeed: Math.max(a.highSeed, b.highSeed),
    day: (recent.day?.seed ?? -1) >= (other.day?.seed ?? -1) ? recent.day : other.day,

    // Same rules as the puzzle streak: counters take the max, the streak itself
    // comes from whichever device logged a workout most recently.
    workoutsDone: Math.max(a.workoutsDone ?? 0, b.workoutsDone ?? 0),
    maxWorkoutStreak: Math.max(a.maxWorkoutStreak ?? 0, b.maxWorkoutStreak ?? 0),
    // A personal best is a high-water mark, so max is the whole merge rule.
    drillBest: Math.max(a.drillBest ?? 0, b.drillBest ?? 0),
    // Earned on either device counts.
    drillFlawless: (a.drillFlawless ?? false) || (b.drillFlawless ?? false),
    workoutStreak: Math.min(
      ((a.lastWorkoutSeed ?? -1) >= (b.lastWorkoutSeed ?? -1) ? a : b).workoutStreak ?? 0,
      Math.max(a.workoutsDone ?? 0, b.workoutsDone ?? 0),
    ),
    lastWorkoutSeed: Math.max(a.lastWorkoutSeed ?? -1, b.lastWorkoutSeed ?? -1) || null,
  };
}

export type CloudResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Reads this user's row. A missing row is success with `null`, not an error. */
async function fetchCloudSave(userId: string): Promise<CloudResult<SaveData | null>> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('save')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  /*
   * A row is not always a save. `fitdle_reset_progress` writes `'{}'`, and so
   * does `fitdle_claim_ai` for a player who asks the guide before finishing a
   * round. Handed to `mergeSaves`, `{}` threw on `distribution[i]` - and the
   * sign-out path awaits a sync before calling `signOut()`, so that player
   * could not sign out at all. Anything that is not a coherent save is no save,
   * exactly as the server's `readRow` already treats it.
   */
  const save: unknown = data?.save;
  if (!isCoherent(save)) return { ok: true, data: null };
  return { ok: true, data: normalise(save) };
}

/**
 * Clears the player's cloud record.
 *
 * "Reset my statistics" cannot be expressed as a merge - every counter here
 * takes the max, so a cleared local save merged with the surviving cloud row
 * restores it in full. It has to reach the cloud copy or it silently does
 * nothing, which is the bug `overwriteCloud` was written to fix.
 *
 * It then came back. The fix was `pushCloudSave`, an upsert, and revoking the
 * client's `insert`/`update` permission is exactly what forbids an upsert.
 * Measured against a live project, signed in as the row's own owner:
 *
 *   UPDATE own row        -> 0 rows (no policy, so no row is visible to it)
 *   UPSERT own row        -> 42501 new row violates row-level security policy
 *   DELETE own row        -> 1 row
 *
 * The file previously said "It survives for `overwriteCloud`". It did not, and
 * the test that pins why the overwrite is necessary went on passing throughout,
 * because it tests the merge rather than the write.
 *
 * `fitdle_reset_progress` is the way back in: a security-definer function that
 * clears the save on the caller's own row and nothing else. Deleting the row
 * takes `tier` and the AI counters with it, which made it a free AI-quota
 * reset, so the current schema revokes it. Deletion survives only as the
 * fallback for a project that has not run the newer schema - which also still
 * has the old delete policy, so the fallback works exactly where it runs.
 */
export async function clearCloudSave(): Promise<CloudResult<true>> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };

  const { error } = await supabase.rpc('fitdle_reset_progress');
  if (!error) return { ok: true, data: true };

  /*
   * The function is missing, which means the schema has not been re-run.
   * Fall back to deleting the row: the player asked for their statistics to be
   * cleared and a reset that silently does nothing is worse than one that also
   * clears a tier nobody has yet set. `npm run cloud:check` names the fix.
   */
  const missing =
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function/i.test(error.message);
  if (!missing) return { ok: false, error: error.message };

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return { ok: false, error: 'Not signed in.' };

  const del = await supabase.from(TABLE).delete().eq('user_id', user.user.id);
  if (del.error) return { ok: false, error: del.error.message };
  return { ok: true, data: true };
}

/**
 * Pull the cloud record and reconcile it with what is on this device.
 *
 * This used to pull, merge, and push the merged result back. It no longer
 * pushes: the server owns the progress row now, so a client that wrote its
 * merge back would be overwriting the authoritative record with a number it
 * computed itself - exactly the hole this whole change closes.
 *
 * The merge still happens locally, because the device may hold a legitimately
 * newer in-progress board, or progress earned while signed out. Anything a
 * merge produces that the server disagrees with is corrected on the next
 * completed round, when the API writes the truth and returns it.
 */
export async function syncSave(
  userId: string,
  local: SaveData,
): Promise<CloudResult<SaveData>> {
  const remote = await fetchCloudSave(userId);
  if (!remote.ok) return remote;

  return { ok: true, data: remote.data ? mergeSaves(local, remote.data) : local };
}
