import 'server-only';
import { adminClient } from '@/server/supabase';

/**
 * Per-account AI quota.
 *
 * The global daily budget in `aiBudget.ts` stops a stampede, but on its own it
 * is first-come-first-served: one enthusiastic person could spend the whole
 * day's allowance before most players opened the app. A shared ceiling with no
 * per-user share is not a free tier, it is a race.
 *
 * So the spend is divided. Everyone gets a daily allowance, signing in gets you
 * more, and the paid tier gets enough that a human will not notice a limit.
 *
 * ── Where the counters live, and why ────────────────────────────────────────
 * Signed in: a column on the player's row, written with the service-role key.
 * Durable, survives restarts, and cannot be reset by clearing localStorage -
 * which matters, because an allowance you can refill from devtools is not one.
 *
 * Anonymous: in memory, keyed by address. Weaker on purpose. There is no
 * identity to attach a durable counter to, and building one would mean
 * fingerprinting people to enforce a free tier, which is a worse trade than
 * letting a determined anonymous user get a few extra questions. The allowance
 * is small enough that the leak does not matter.
 */

const TABLE = 'fitdle_progress';

export type Tier = 'free' | 'pro';

/**
 * Daily AI messages, guide and coach combined.
 *
 * Combined rather than separate so the limit is one number a player can hold in
 * their head. Two budgets that run out independently is the kind of thing that
 * reads as broken rather than as a policy.
 */
export const QUOTA: Record<Tier | 'anonymous', number> = {
  // Enough to answer a real question and see it is useful. Not enough to lean on.
  anonymous: 2,
  // A daily puzzle generates a handful of questions at most; this is generous
  // for the intended use and only bites on sustained chatting.
  free: 5,
  // Effectively unlimited for a person. Still a number, because "unlimited"
  // plus an API key is how you find out what unlimited costs.
  pro: 100,
};

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  tier: Tier | 'anonymous';
}

/** UTC day number. Lines the reset up with the puzzle rollover. */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function normaliseTier(raw: unknown): Tier {
  // An unrecognised tier gets free limits rather than the benefit of the doubt.
  return raw === 'pro' ? 'pro' : 'free';
}

/* ── anonymous ────────────────────────────────────────────────────────────── */

const anon = new Map<string, { day: number; used: number }>();

function claimAnonymous(key: string, consume: boolean): QuotaState {
  const limit = QUOTA.anonymous;
  const day = today();
  const entry = anon.get(key);
  const used = entry && entry.day === day ? entry.used : 0;

  if (used >= limit) {
    return { allowed: false, used, limit, remaining: 0, tier: 'anonymous' };
  }
  if (consume) anon.set(key, { day, used: used + 1 });

  const now = consume ? used + 1 : used;
  return { allowed: true, used: now, limit, remaining: limit - now, tier: 'anonymous' };
}

/* ── signed in ────────────────────────────────────────────────────────────── */

/**
 * Reads and optionally consumes one message from a signed-in player's day.
 *
 * Read-modify-write rather than an atomic increment, which means two requests
 * racing can both read the same count and one message goes uncharged. That is
 * a deliberate trade: the alternative is a Postgres function and a round trip
 * on every read, to defend a limit whose worst-case abuse is a handful of extra
 * questions. The global budget is the backstop for anything larger.
 */
async function claimUser(userId: string, consume: boolean): Promise<QuotaState> {
  const client = adminClient();

  // No service-role key means no durable counter. Fall back to free limits
  // without consuming, rather than locking a paying user out over config.
  if (!client) {
    return {
      allowed: true,
      used: 0,
      limit: QUOTA.free,
      remaining: QUOTA.free,
      tier: 'free',
    };
  }

  const { data, error } = await client
    .from(TABLE)
    .select('tier, ai_day, ai_count')
    .eq('user_id', userId)
    .maybeSingle();

  /*
   * A read error means the counter cannot be trusted - overwhelmingly because
   * the migration adding these columns has not been run (Postgres 42703).
   *
   * Discarding it fails OPEN, and open on the one path that costs money: `data`
   * comes back null, so the row reads as zero used, the increment then fails
   * too, and every signed-in player has unlimited AI forever. The global budget
   * would be the only thing left standing.
   *
   * So a broken counter drops to the anonymous allowance, enforced in memory.
   * The player still gets a couple of questions rather than an error, and the
   * bill still has a per-person ceiling. `maybeSingle` returns no error for a
   * player who simply has no row yet, so the ordinary first-time case is
   * unaffected.
   */
  if (error) {
    console.error('[quota] cannot read counters, falling back to anonymous limits:', error.message);
    return claimAnonymous(`degraded:${userId}`, consume);
  }

  const tier = normaliseTier(data?.tier);
  const limit = QUOTA[tier];
  const day = today();
  // A row from another day reads as zero used - no sweep job needed.
  const used = data?.ai_day === day ? ((data?.ai_count as number) ?? 0) : 0;

  if (used >= limit) {
    return { allowed: false, used, limit, remaining: 0, tier };
  }

  if (consume) {
    const { error } = await client
      .from(TABLE)
      .update({ ai_day: day, ai_count: used + 1 })
      .eq('user_id', userId);

    // A failed write must not deny a question the player is entitled to. It
    // means one message goes uncharged, which is the right way round to fail.
    if (error) console.error('[quota] write failed', error.message);
  }

  const now = consume ? used + 1 : used;
  return { allowed: true, used: now, limit, remaining: limit - now, tier };
}

/* ── public ───────────────────────────────────────────────────────────────── */

/**
 * Claims one AI message.
 *
 * `userId` null means anonymous, and `key` is then the address used to keep
 * them apart. Call immediately before the model request.
 */
export function claimQuota(userId: string | null, key: string): Promise<QuotaState> {
  return userId ? claimUser(userId, true) : Promise.resolve(claimAnonymous(key, true));
}

/** Current standing without spending anything. For rendering the counter. */
export function peekQuota(userId: string | null, key: string): Promise<QuotaState> {
  return userId ? claimUser(userId, false) : Promise.resolve(claimAnonymous(key, false));
}
