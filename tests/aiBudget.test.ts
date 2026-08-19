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
