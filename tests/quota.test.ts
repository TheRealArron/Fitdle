import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QUOTA, claimQuota, peekQuota } from '@/server/quota';
import { readCode, readSource } from './helpers/source.ts';

/*
 * The free tier.
 *
 * The signed-in path needs a live Supabase project, so these cover the
 * anonymous path (which is fully in-process) plus the structural properties
 * that would quietly break the tier if they regressed.
 */

const quotaUrl = new URL('../src/server/quota.ts', import.meta.url);
const quota = readSource(quotaUrl);
/* Comments stripped: an absence check must not match the comment explaining
   the absence. See tests/helpers/source.ts. */
const quotaCode = readCode(quotaUrl);

/* ── the tiers make sense as a ladder ─────────────────────────────────────── */

test('each tier is strictly more generous than the one below', () => {
  // A tier that does not buy you more is not a tier.
  assert.ok(QUOTA.anonymous < QUOTA.free, 'signing in must be worth something');
  assert.ok(QUOTA.free < QUOTA.pro, 'upgrading must be worth something');
});

test('the anonymous allowance is a taste, not a meal', () => {
  /*
   * It is enforced in memory, so a determined anonymous user can reset it.
   * That is acceptable precisely because the number is small - the alternative
   * is fingerprinting people to defend a free tier, which is a worse trade.
   */
  assert.ok(QUOTA.anonymous <= 3, `${QUOTA.anonymous} is too many to give away unmetered`);
});

test('pro is bounded, not "unlimited"', () => {
  // "Unlimited" plus an API key is how you discover what unlimited costs.
  assert.ok(Number.isFinite(QUOTA.pro) && QUOTA.pro <= 500, 'pro has no real ceiling');
});

/* ── the anonymous counter ────────────────────────────────────────────────── */

test('an anonymous caller is cut off at the limit', async () => {
  const key = `a${Math.random()}`;
  for (let i = 0; i < QUOTA.anonymous; i++) {
    const s = await claimQuota(null, key);
    assert.equal(s.allowed, true, `blocked at ${i + 1}, before the limit`);
  }
  const over = await claimQuota(null, key);
  assert.equal(over.allowed, false, 'allowed past the limit');
  assert.equal(over.remaining, 0);
});

test('callers are counted separately', async () => {
  // One person exhausting theirs must not spend anyone else's.
  const a = `x${Math.random()}`;
  const b = `y${Math.random()}`;
  for (let i = 0; i < QUOTA.anonymous; i++) await claimQuota(null, a);
  assert.equal((await claimQuota(null, a)).allowed, false);
  assert.equal((await claimQuota(null, b)).allowed, true, 'one caller drained another');
});

test('peeking does not spend', async () => {
  // The UI renders the counter on every open; that must not cost a question.
  const key = `p${Math.random()}`;
  await claimQuota(null, key);
  const first = await peekQuota(null, key);
  await peekQuota(null, key);
  const second = await peekQuota(null, key);
  assert.equal(first.used, second.used, 'reading the counter incremented it');
});

test('remaining is reported so the UI can warn before the wall', async () => {
  /*
   * A limit you only discover by hitting it reads as broken. Shown up front it
   * reads as a policy - and it is the only place an upgrade is mentioned.
   */
  const s = await claimQuota(null, `r${Math.random()}`);
  assert.equal(s.remaining, s.limit - s.used);
  assert.ok(s.remaining >= 0);
});

/* ── structural ───────────────────────────────────────────────────────────── */

test('an unknown tier gets free limits, not the benefit of the doubt', () => {
  // A typo in the column, or a tier added later and rolled back, must fail
  // closed. Failing open here is someone else's API bill.
  assert.match(quota, /raw === 'pro' \? 'pro' : 'free'/);
});

test('the signed-in counter is durable, not client-held', () => {
  /*
   * An allowance you can refill by clearing localStorage is not an allowance.
   * It lives on the row and is written with the service-role key, which the
   * browser does not have.
   */
  assert.match(quota, /adminClient\(\)/);
  assert.match(quota, /\.update\(\{ ai_day: day, ai_count: used \+ 1 \}\)/);
  assert.ok(!/localStorage/.test(quotaCode), 'the quota touches client storage');
});

test('quota is claimed before the model call, on both surfaces', () => {
  // A check after the request has already spent what it exists to protect.
  for (const file of ['guide', 'coach']) {
    const route = readFileSync(
      new URL(`../src/app/api/${file}/route.ts`, import.meta.url),
      'utf8',
    );
    const claimAt = route.indexOf('claimQuota(');
    const callAt = route.indexOf(file === 'guide' ? 'askGuide(' : 'askCoach(');
    assert.ok(claimAt > 0, `${file} does not claim quota`);
    assert.ok(callAt > claimAt, `${file} calls the model before claiming quota`);
  }
});

test('a failed counter write does not deny an entitled question', () => {
  // One uncharged message is the right way round to fail.
  assert.match(quota, /console\.error\('\[quota\] write failed'/);
});

test('the day key is UTC, matching the puzzle rollover', () => {
  // A quota that resets at a different moment than the puzzle is confusing for
  // no benefit, and a stale row must read as zero rather than need a sweep job.
  assert.match(quota, /Math\.floor\(Date\.now\(\) \/ 86_400_000\)/);
  assert.match(quota, /ai_day === day/);
});

test('the schema carries tier and the counters', () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /add column if not exists tier text not null default 'free'/);
  assert.match(schema, /add column if not exists ai_day int/);
  assert.match(schema, /add column if not exists ai_count int/);
});
