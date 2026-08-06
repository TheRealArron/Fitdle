import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { aiBudgetUsed, claimAiBudget } from '@/server/aiBudget';

test('the budget counts down and then refuses', () => {
  process.env.AI_DAILY_BUDGET = '3';
  const key = `t${Math.random()}`;

  assert.equal(claimAiBudget(key).allowed, true);
  assert.equal(claimAiBudget(key).allowed, true);
  assert.equal(claimAiBudget(key).allowed, true);
  assert.equal(claimAiBudget(key).allowed, false, 'the fourth call was allowed through');
  assert.equal(claimAiBudget(key).allowed, false, 'refusal is not sticky');
});

test('surfaces have independent budgets', () => {
  // The coach running dry must not silently take the guide with it.
  process.env.AI_DAILY_BUDGET = '1';
  const a = `a${Math.random()}`;
  const b = `b${Math.random()}`;
  assert.equal(claimAiBudget(a).allowed, true);
  assert.equal(claimAiBudget(a).allowed, false);
  assert.equal(claimAiBudget(b).allowed, true, 'one surface exhausted the other');
});

test('a budget of zero disables the feature entirely', () => {
  // The documented way to ship with the AI off without removing the key.
  process.env.AI_DAILY_BUDGET = '0';
  assert.equal(claimAiBudget(`z${Math.random()}`).allowed, false);
});

test('an explicit zero disables; a blank value does not', () => {
  /*
   * Caught a real bug: `Number('')` is 0, so a blank `AI_DAILY_BUDGET=` in an
   * env file read as "budget of zero" and silently switched the AI off
   * everywhere. Blanking a variable to get the default is the natural thing to
   * do, and it did the opposite.
   */
  process.env.AI_DAILY_BUDGET = '';
  assert.ok(aiBudgetUsed(`e${Math.random()}`).limit > 0, 'a blank value disabled the feature');

  process.env.AI_DAILY_BUDGET = '   ';
  assert.ok(aiBudgetUsed(`w${Math.random()}`).limit > 0, 'whitespace disabled the feature');
});

test('a nonsense budget falls back to the default rather than to infinity', () => {
  /*
   * The dangerous direction. A typo in an env var must not read as "unlimited"
   * - that is exactly the failure this module exists to prevent.
   */
  for (const bad of ['lots', '-5', 'NaN']) {
    process.env.AI_DAILY_BUDGET = bad;
    const { limit } = aiBudgetUsed(`n${Math.random()}`);
    assert.ok(limit > 0 && limit <= 500, `AI_DAILY_BUDGET="${bad}" gave a limit of ${limit}`);
  }
});

test('reading usage does not consume any', () => {
  process.env.AI_DAILY_BUDGET = '5';
  const key = `r${Math.random()}`;
  claimAiBudget(key);
  assert.equal(aiBudgetUsed(key).used, 1);
  assert.equal(aiBudgetUsed(key).used, 1, 'the read incremented the counter');
});

test('the module is honest about being per-instance', () => {
  // A billing guarantee it is not, and the comment must keep saying so.
  const src = readFileSync(new URL('../src/server/aiBudget.ts', import.meta.url), 'utf8');
  assert.match(src, /per-instance/);
  assert.match(src, /NOT a billing guarantee/);
});
