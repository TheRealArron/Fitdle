import 'server-only';
import type { QuotaState, Tier } from '@/lib/contracts';
import { count, secondsUntilUtcMidnight, utcDay } from '@/server/counter';
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


/**
 * Daily AI messages, guide and coach combined.
 *
 * Combined rather than separate so the limit is one number a player can hold in
 * their head. Two budgets that run out independently is the kind of thing that
 * reads as broken rather than as a policy.
 */
export type { QuotaState, Tier };

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

function normaliseTier(raw: unknown): Tier {
  // An unrecognised tier gets free limits rather than the benefit of the doubt.
  return raw === 'pro' ? 'pro' : 'free';
}

/* ── anonymous ────────────────────────────────────────────────────────────── */

async function claimAnonymous(key: string, consume: boolean): Promise<QuotaState> {
  const limit = QUOTA.anonymous;
  const r = await count(`quota:${key}`, limit, utcDay(), secondsUntilUtcMidnight(), consume);
  return {
    allowed: r.allowed,
    used: r.count,
    limit,
    remaining: Math.max(0, limit - r.count),
    tier: 'anonymous',
  };
}

/* ── signed in ────────────────────────────────────────────────────────────── */

/**
 * Reads and optionally consumes one message from a signed-in player's day.
 *
 * ── Why this is one database call and not three ─────────────────────────────
 * It used to SELECT the count, compare it in JavaScript, then UPDATE. Two
 * requests arriving together both read the same number, both concluded there
 * was room, and both wrote it - the counter advanced by one while two messages
 * were spent. Small in isolation, and on the only path in this app that spends
 * money.
 *
 * `fitdle_claim_ai` is the same decision as a single UPDATE whose WHERE clause
 * carries the limit test, so Postgres evaluates it against the row it is about
 * to lock. There is no gap between the check and the write because they are the
 * same statement. The limits are passed IN rather than written in SQL, so QUOTA
 * below stays the only place they are defined.
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

  const { data, error } = await client.rpc('fitdle_claim_ai', {
    p_user: userId,
    p_day: utcDay(),
    p_free: QUOTA.free,
    p_pro: QUOTA.pro,
    p_consume: consume,
  });

  /*
   * A failure here means the counter cannot be trusted - overwhelmingly because
   * the migration adding this function has not been run yet.
   *
   * Discarding the error fails OPEN, and open on the path that costs money:
   * every signed-in player would have unlimited AI and the global budget would
   * be the only thing left standing. So a broken counter drops to the anonymous
   * allowance, enforced in memory. The player still gets a couple of questions
   * rather than an error, and the bill still has a per-person ceiling.
   */
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error(
      '[quota] cannot claim, falling back to anonymous limits:',
      error?.message ?? 'no row returned',
    );
    return claimAnonymous(`degraded:${userId}`, consume);
  }

  const tier = normaliseTier(row.tier);
  const used = Number(row.used) || 0;
  // Trust our own constants over the row for the limit, so a stale deployment
  // of the function cannot quietly hand out a different allowance.
  const limit = QUOTA[tier];

  return {
    allowed: Boolean(row.allowed),
    used,
    limit,
    remaining: Math.max(0, limit - used),
    tier,
  };
}

/* ── public ───────────────────────────────────────────────────────────────── */

/**
 * Claims one AI message.
 *
 * `userId` null means anonymous, and `key` is then the address used to keep
 * them apart. Call immediately before the model request.
 */
export function claimQuota(userId: string | null, key: string): Promise<QuotaState> {
  return userId ? claimUser(userId, true) : claimAnonymous(key, true);
}

/** Current standing without spending anything. For rendering the counter. */
export function peekQuota(userId: string | null, key: string): Promise<QuotaState> {
  return userId ? claimUser(userId, false) : claimAnonymous(key, false);
}
