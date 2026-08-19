import 'server-only';

/**
 * A hard daily ceiling on model calls.
 *
 * The rate limiter caps how fast ONE address can ask. It says nothing about
 * what everybody costs together, and those are different problems: 1,000
 * players asking three questions each is entirely within every per-IP limit and
 * still an unbounded bill. Nothing in this app stood between a good day on
 * Hacker News and a surprise invoice.
 *
 * So this is a spend cap expressed in requests. When the day's budget is gone,
 * the AI features say so and switch off until UTC midnight. Everything else -
 * the game, the drill, the leaderboard, the home substitutions - is untouched,
 * because none of it was ever load-bearing on the model.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 * It counts in-process. That makes it a guard against runaway usage, and
 * explicitly NOT a billing guarantee. See `memoryCounter.ts` for why that trade
 * was made and where to change it if it ever has to be one. Treat Anthropic Console spend limits as the real backstop
 * and this as what degrades gracefully before you reach them.
 */

import { count, secondsUntilUtcMidnight, utcDay } from '@/server/counter';

/** Requests per UTC day, across all callers. Override with AI_DAILY_BUDGET. */
const DEFAULT_BUDGET = 500;

function budget(): number {
  /*
   * An EMPTY value means unset, not zero.
   *
   * `Number('')` is 0, which is finite and non-negative, so a blank
   * `AI_DAILY_BUDGET=` in an env file read as "budget of zero" and silently
   * switched the AI off everywhere. Blanking a variable to "use the default" is
   * the natural thing to do, and it did the opposite.
   *
   * An explicit `0` still means off - that is the documented way to ship with
   * the key present and the feature disabled.
   */
  const raw = process.env.AI_DAILY_BUDGET?.trim();
  if (!raw) return DEFAULT_BUDGET;

  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_BUDGET;
}

export interface BudgetCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Claims one unit of the day's budget.
 *
 * Call it immediately before the model request, not after: a check that runs
 * afterwards has already spent the money it was meant to prevent.
 */
export async function claimAiBudget(name: string): Promise<BudgetCheck> {
  const limit = budget();
  const r = await count(`budget:${name}`, limit, utcDay(), secondsUntilUtcMidnight());
  return { allowed: r.allowed, used: r.count, limit };
}

/** Current usage without claiming. For diagnostics only. */
export async function aiBudgetUsed(name: string): Promise<BudgetCheck> {
  const limit = budget();
  const r = await count(`budget:${name}`, limit, utcDay(), secondsUntilUtcMidnight(), false);
  return { allowed: r.allowed, used: r.count, limit };
}
