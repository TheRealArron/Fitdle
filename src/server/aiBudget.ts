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
 * In-memory and per-instance, exactly like the rate limiter. On a platform that
 * runs several serverless instances the effective budget multiplies by the
 * instance count, and it resets on a cold start. That makes it a guard against
 * runaway usage, NOT a billing guarantee.
 *
 * Treat Anthropic Console spend limits as the real backstop and this as the
 * thing that degrades gracefully before you hit it. If you need a true cap,
 * this is the seam to move to Redis - the call site takes a name and returns
 * the same shape.
 */

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

interface DayCount {
  day: number;
  used: number;
}

const counters = new Map<string, DayCount>();

/** UTC day number, so the reset lines up with the puzzle rollover. */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
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
export function claimAiBudget(name: string): BudgetCheck {
  const limit = budget();
  const day = today();
  const entry = counters.get(name);

  if (!entry || entry.day !== day) {
    counters.set(name, { day, used: 1 });
    return { allowed: limit > 0, used: 1, limit };
  }

  if (entry.used >= limit) return { allowed: false, used: entry.used, limit };

  entry.used += 1;
  return { allowed: true, used: entry.used, limit };
}

/** Current usage without claiming. For diagnostics only. */
export function aiBudgetUsed(name: string): BudgetCheck {
  const limit = budget();
  const entry = counters.get(name);
  const used = entry && entry.day === today() ? entry.used : 0;
  return { allowed: used < limit, used, limit };
}
