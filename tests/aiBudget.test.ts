import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { aiBudgetUsed, claimAiBudget } from '@/server/aiBudget';

test('the budget counts down and then refuses', async () => {
  process.env.AI_DAILY_BUDGET = '3';
  const key = `t${Math.random()}`;

  assert.equal((await claimAiBudget(key)).allowed, true);
  assert.equal((await claimAiBudget(key)).allowed, true);
  assert.equal((await claimAiBudget(key)).allowed, true);
  assert.equal((await claimAiBudget(key)).allowed, false, 'the fourth call was allowed through');
  assert.equal((await claimAiBudget(key)).allowed, false, 'refusal is not sticky');
});

test('surfaces have independent budgets', async () => {
  // The coach running dry must not silently take the guide with it.
  process.env.AI_DAILY_BUDGET = '1';
  const a = `a${Math.random()}`;
  const b = `b${Math.random()}`;
  assert.equal((await claimAiBudget(a)).allowed, true);
  assert.equal((await claimAiBudget(a)).allowed, false);
  assert.equal((await claimAiBudget(b)).allowed, true, 'one surface exhausted the other');
});

test('a budget of zero disables the feature entirely', async () => {
  // The documented way to ship with the AI off without removing the key.
  process.env.AI_DAILY_BUDGET = '0';
  assert.equal((await claimAiBudget(`z${Math.random()}`)).allowed, false);
});

test('an explicit zero disables; a blank value does not', async () => {
  /*
   * Caught a real bug: `Number('')` is 0, so a blank `AI_DAILY_BUDGET=` in an
   * env file read as "budget of zero" and silently switched the AI off
   * everywhere. Blanking a variable to get the default is the natural thing to
   * do, and it did the opposite.
   */
  process.env.AI_DAILY_BUDGET = '';
  assert.ok((await aiBudgetUsed(`e${Math.random()}`)).limit > 0, 'a blank value disabled the feature');

  process.env.AI_DAILY_BUDGET = '   ';
  assert.ok((await aiBudgetUsed(`w${Math.random()}`)).limit > 0, 'whitespace disabled the feature');
});

test('a nonsense budget falls back to the default rather than to infinity', async () => {
  /*
   * The dangerous direction. A typo in an env var must not read as "unlimited"
   * - that is exactly the failure this module exists to prevent.
   */
  for (const bad of ['lots', '-5', 'NaN']) {
    process.env.AI_DAILY_BUDGET = bad;
    const { limit } = await aiBudgetUsed(`n${Math.random()}`);
    assert.ok(limit > 0 && limit <= 500, `AI_DAILY_BUDGET="${bad}" gave a limit of ${limit}`);
  }
});

test('reading usage does not consume any', async () => {
  process.env.AI_DAILY_BUDGET = '5';
  const key = `r${Math.random()}`;
  await claimAiBudget(key);
  assert.equal((await aiBudgetUsed(key)).used, 1);
  assert.equal((await aiBudgetUsed(key)).used, 1, 'the read incremented the counter');
});

test('the counting is honest about being per-instance', async () => {
  /*
   * A billing guarantee it is not, and that must keep being said somewhere a
   * reader will find it. The caveat lives in the shared counter now rather than
   * being restated by each of its three callers - so this asserts it is stated,
   * not which file states it.
   */
  const budget = readFileSync(new URL('../src/server/aiBudget.ts', import.meta.url), 'utf8');
  const counter = readFileSync(new URL('../src/server/memoryCounter.ts', import.meta.url), 'utf8');

  assert.match(budget, /NOT a billing guarantee/, 'the budget overstates what it guarantees');
  assert.match(counter, /in the process|per-instance|instance count/i);
  assert.match(counter, /SPEED BUMP|speed bump/i);
});

/* ── one map, three period scales ─────────────────────────────────────────── */

test('rate-limit traffic cannot wipe the day’s AI budget', async () => {
  /*
   * `memoryCounter` holds every counter in one map, and the window id it keys
   * them by means different things to different callers:
   *
   *     utcDay   ~20,717        the AI budget and the anonymous AI quota
   *     seed     ~20,260,921    the per-account guess floor (YYYYMMDD)
   *     minute   ~29,833,266    every rate limit
   *
   * The sweep compared `bucket.window < currentWindow` across all three, so a
   * sweep triggered by a rate-limit call deleted every day-scoped and
   * seed-scoped bucket - live ones included, because their ids are numerically
   * smaller.
   *
   * Measured before the fix: spend 3 of the day's budget, make 5,100
   * rate-limited requests from distinct addresses, and the budget reads 0 used.
   * The global spend cap exists to stop a busy day becoming a surprise invoice,
   * and thousands of distinct addresses IS a busy day.
   *
   * This test doubles as the reclamation check, because the sweep throttles to
   * once a minute and one test run gets one sweep.
   */
  const { count, utcDay, secondsUntilUtcMidnight } = await import('@/server/memoryCounter');

  const day = utcDay();
  const minute = Math.floor(Date.now() / 60_000);
  const live = `sweep-live-${Math.random()}`;
  const dead = `sweep-dead-${Math.random()}`;

  for (let i = 0; i < 3; i++) count(live, 500, day, secondsUntilUtcMidnight());
  count(dead, 500, day, 0); // expires immediately

  // Enough distinct rate-limit keys to take the map past the sweep threshold.
  for (let i = 0; i < 5_100; i++) count(`flood:${i}`, 20, minute, 60);

  assert.equal(
    count(live, 500, day, secondsUntilUtcMidnight(), false).count,
    3,
    'a live day-scoped counter must survive a flood of minute-scoped ones',
  );
  assert.equal(
    count(dead, 500, day, 0, false).count,
    0,
    'and an expired bucket must still be reclaimed, or this is a memory leak',
  );
});
