import { MAX_GUESSES } from '@/data/exercises';
import { getSupabase } from '@/lib/supabase';
import type { SaveData } from '@/lib/secureStorage';

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
  return { ok: true, data: (data?.save as SaveData | undefined) ?? null };
}

/**
 * Writes the player's row.
 *
 * ⚠ The client no longer has permission to do this for progress. RLS grants
 * `select` and `delete` only; `insert` and `update` were revoked when the
 * server took ownership of the streak, so this now fails for ordinary players
 * and that is the intended behaviour rather than a bug to route around.
 *
 * It survives for `overwriteCloud`, which is how "reset my statistics" clears
 * the cloud copy - and a reset can only ever lower a streak, so nothing is at
 * risk. That path will move to a DELETE once there is a reason to touch it.
 */
export async function pushCloudSave(
  userId: string,
  save: SaveData,
): Promise<CloudResult<true>> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, save, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) return { ok: false, error: error.message };
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
