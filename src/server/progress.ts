import 'server-only';
import {
  commitResult,
  defaultSave,
  normalise,
  reconcile,
  type SaveData,
} from '@/lib/secureStorage';
import { adminClient } from '@/server/supabase';

/**
 * The authoritative streak.
 *
 * Until now the browser computed its own streak and uploaded it. RLS stopped
 * you writing someone else's row; it said nothing about the truthfulness of
 * your own, so `streak: 9999` was a devtools one-liner. That was tolerable
 * while the number was private. A public leaderboard makes forging it worth
 * doing, which is why this had to land before the leaderboard rather than after.
 *
 * So the server now owns the record: `/api/guess` already knows - from a signed
 * session it issued itself - that you won and in how many guesses, and it
 * writes that conclusion directly. The browser's copy becomes a cache.
 *
 * The arithmetic is deliberately the SAME `reconcile` / `commitResult` the
 * client uses, imported rather than reimplemented. A second copy of streak
 * rules would drift, and the two would disagree about who was right.
 */

const TABLE = 'fitdle_progress';

export interface BankedProgress {
  save: SaveData;
  /** False when the round had already been banked, or nothing was written. */
  written: boolean;
}

/** Reads a user's authoritative record. Null when absent or unreachable. */
async function readRow(userId: string): Promise<SaveData | null> {
  const client = adminClient();
  if (!client) return null;

  const { data, error } = await client
    .from(TABLE)
    .select('save')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.save) return null;
  return normalise(data.save as SaveData);
}

/**
 * Banks a finished round against the server's copy of the player's record.
 *
 * Idempotent by construction: `commitResult` refuses to pay out twice for the
 * same seed, so a retried request, a double-submitted guess, or a client that
 * replays the winning call cannot inflate anything. That property is inherited
 * rather than re-implemented, and a test pins it.
 *
 * Returns null when there is nothing to write against (anonymous player, or no
 * service-role key configured) - the caller falls back to local-only play.
 */
export async function bankResult(
  userId: string,
  seed: number,
  won: boolean,
  guessCount: number,
  username?: string | null,
): Promise<BankedProgress | null> {
  const client = adminClient();
  if (!client) return null;

  const existing = (await readRow(userId)) ?? defaultSave();

  // Same order the client uses: roll the day forward first (which breaks a
  // streak for missed days and detects a rolled-back clock), then bank.
  const { save: rolled, clockRollback } = reconcile(existing, seed);
  const before = rolled.lastSeed;
  const next = commitResult(rolled, seed, won, guessCount, !clockRollback);

  // Nothing changed - the round was already banked. Skip the write.
  if (before === seed) return { save: next, written: false };

  const { error } = await client
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        save: next,
        updated_at: new Date().toISOString(),
        /*
         * Denormalised so the leaderboard can show a name without reading
         * auth.users - which nobody can do for another account, correctly.
         * Refreshed on every bank, so a rename propagates on the next round
         * rather than needing a migration.
         */
        ...(username ? { username } : {}),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    // A failed write must not fail the guess. The player still gets their
    // result; the streak reconciles on their next completed round.
    console.error('[progress] write failed', error.message);
    return { save: next, written: false };
  }

  return { save: next, written: true };
}

