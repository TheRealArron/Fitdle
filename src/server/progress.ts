import 'server-only';
import {
  commitResult,
  defaultSave,
  isCoherent,
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

  /*
   * A row is not automatically a save.
   *
   * `fitdle_claim_ai` creates the row for a player who has never played - it
   * has to, because asking the guide a question should not be the thing that
   * fails - and seeds `save` as `{}`. That is a truthful "has not played" and
   * the generated leaderboard columns read null out of it, which is correct.
   *
   * It is not a `SaveData`. `normalise` only backfills the fields added after
   * v1, so `{}` came back with no `distribution`, `reconcile` did
   * `[...input.distribution]` on undefined, and the exception escaped
   * `/api/guess`. Reproduced end to end against a live project: sign up, ask
   * the guide one question, play, and the guess that WINS the round returns
   * HTTP 500 - no reveal, no streak, nothing banked. The one path this file's
   * own comments promise will never cost somebody their result.
   *
   * So the row is checked against the same coherence rule the browser applies
   * to local storage, and anything that is not a usable record is treated as
   * "no record" - which for the `{}` case is exactly right, since that is what
   * it means.
   */
  if (!isCoherent(data.save)) {
    console.error('[progress] stored record is not a usable save; treating as none');
    return null;
  }
  return normalise(data.save);
}

/**
 * Banks a finished round against the server's copy of the player's record.
 *
 * `guesses` is the board as this session played it; `spent` is how many guesses
 * the player has actually used on this puzzle, which is the larger of that and
 * the server's own count. They differ when somebody discards their session and
 * restarts the day, and `spent` is the one that is ranked and recorded.
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
  guesses: string[],
  spent: number,
  username?: string | null,
): Promise<BankedProgress | null> {
  const client = adminClient();
  if (!client) return null;

  const existing = (await readRow(userId)) ?? defaultSave();

  // Same order the client uses: roll the day forward first (which breaks a
  // streak for missed days and detects a rolled-back clock), then bank.
  const { save: rolled, clockRollback } = reconcile(existing, seed);
  const before = rolled.lastSeed;
  const next = commitResult(rolled, seed, won, spent, !clockRollback);

  /*
   * Write the day record. This is what the leaderboard's generated columns are
   * derived from, and nothing was writing it.
   *
   * `reconcile` creates the record and `commitResult` writes the counters -
   * neither touches `day`, so every row the server banked carried
   * `{guesses: [], status: 'playing'}` however the round actually went. The
   * "Today" board filters `day_won = true`, so it matched nobody and could not
   * ever have matched anybody. Measured against a live project: a player won,
   * the row read `day_won = false`, and the board query returned zero rows.
   *
   * The client used to write this as it played. The RLS revocation took that
   * write away and the server never picked it up.
   *
   * `guesses` is the real board, kept truthful so a reload restores it and so
   * `isCoherent` accepts it. `spent` is what the round is RANKED by, and the
   * two differ the moment somebody discards their session and starts the day
   * over - see the floor in `/api/guess`.
   */
  next.day = {
    ...(next.day ?? { seed, guesses: [], status: 'playing' }),
    seed,
    guesses,
    status: won ? 'won' : 'lost',
    spent,
  };

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

