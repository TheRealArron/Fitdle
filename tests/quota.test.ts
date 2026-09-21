import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QUOTA, claimQuota, peekQuota } from '@/server/quota';
import { aiConfigured } from '@/server/aiBudget';
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
  assert.match(quota, /rpc\('fitdle_claim_ai'/, 'the durable claim must go through Postgres');
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

test('the claim is atomic, so two requests cannot both spend the last message', () => {
  /*
   * The bug this replaced: SELECT the count, compare it in JavaScript, UPDATE
   * it. Two requests arriving together both read the same number, both decide
   * there is room, and both write it - the counter advances by one while two
   * messages are spent, on the only path here that costs money.
   *
   * The fix is that the limit test is inside the UPDATE's WHERE clause, so
   * Postgres evaluates it against the row it is about to lock. This asserts the
   * shape, because a read-modify-write reintroduced later would look perfectly
   * reasonable in review.
   */
  assert.ok(
    !/\.select\('tier, ai_day, ai_count'\)/.test(quotaCode),
    'the quota is reading then writing again; that race is what the RPC removed',
  );

  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const fn = schema.slice(schema.indexOf('function public.fitdle_claim_ai'));
  assert.match(fn, /update public\.fitdle_progress/, 'the claim must be an UPDATE');
  assert.match(
    fn,
    /where[\s\S]{0,200}?ai_count < case when p\.tier = 'pro'/,
    'the limit test must be in the WHERE clause, not decided by the caller',
  );
});

test('the SQL owns no limits of its own', () => {
  /*
   * The numbers belong to QUOTA in the application. Writing them in SQL as well
   * creates two sources of truth that drift the first time one is tuned, and
   * the drift is invisible until someone is charged for it.
   */
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const fn = schema.slice(schema.indexOf('function public.fitdle_claim_ai'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  for (const n of [QUOTA.free, QUOTA.pro, QUOTA.anonymous]) {
    assert.ok(!new RegExp(`\\b${n}\\b`).test(body), `${n} is hardcoded in the SQL`);
  }
  assert.match(body, /p_free/);
  assert.match(body, /p_pro/);
});

test('the day key is UTC, matching the puzzle rollover', () => {
  /*
   * A quota resetting at a different moment than the puzzle is confusing for no
   * benefit, and a stale row must read as zero rather than need a sweep job.
   *
   * The day arithmetic moved to the shared counter, so this checks the quota
   * USES it rather than checking for an inline expression it no longer has.
   */
  assert.match(quota, /utcDay\(\)/, 'the quota does not use the shared UTC day');

  // Postgres decides whether a row belongs to today, so the comparison moved
  // into the function with the rest of the claim.
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /when p\.ai_day = p_day then p\.ai_count \+ 1 else 1 end/);

  const counter = readFileSync(new URL('../src/server/memoryCounter.ts', import.meta.url), 'utf8');
  assert.match(counter, /Math\.floor\(Date\.now\(\) \/ 86_400_000\)/);
});

test('the schema carries tier and the counters', () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /add column if not exists tier text not null default 'free'/);
  assert.match(schema, /add column if not exists ai_day int/);
  assert.match(schema, /add column if not exists ai_count int/);
});

test('a broken counter falls back to anonymous limits, not to unlimited', () => {
  /*
   * The migration-skipped case, and the one that fails in the expensive
   * direction if it is got wrong.
   *
   * Discarding the read error means `data` is null, so the row reads as zero
   * used; the increment then fails too, and every signed-in player has
   * unlimited AI forever with only the global budget in the way. A broken
   * counter must therefore grant LESS, not more.
   */
  assert.match(quota, /const \{ data, error \} = await client\.rpc/, 'the error is discarded');
  assert.match(
    quota,
    /if \(error \|\| !row\) \{[\s\S]{0,500}?claimAnonymous\(`degraded:\$\{userId\}`/,
    'a failed claim does not fall back to the anonymous allowance',
  );
});

/* ── a deployment that cannot answer must not charge for the attempt ──────── */

test('with no API key, asking a question costs nothing', async () => {
  /*
   * `askCoach` and `askGuide` check for the key and return "not set up on this
   * deployment" without making a request - but the routes claimed the quota
   * first, so a player on a keyless deployment burned their 2, 5 or 100 daily
   * questions on a feature that answered none of them. Nobody reports that,
   * because it looks like the feature is simply bad.
   */
  const had = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(aiConfigured(), false, 'no key means no model call is possible');

    const key = `no-key-${Math.random()}`;
    const before = await peekQuota(null, key);
    // What the route does when unconfigured: peek, never claim.
    await peekQuota(null, key);
    await peekQuota(null, key);
    const after = await peekQuota(null, key);
    assert.equal(after.used, before.used, 'peeking must never spend');
    assert.equal(after.remaining, QUOTA.anonymous, 'the allowance is untouched');
  } finally {
    if (had === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = had;
  }
});

test('a key present means the allowance is claimed, not peeked', async () => {
  const had = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
  try {
    assert.equal(aiConfigured(), true);
    const key = `with-key-${Math.random()}`;
    const first = await claimQuota(null, key);
    const second = await claimQuota(null, key);
    assert.equal(first.used, 1);
    assert.equal(second.used, 2, 'a configured deployment spends the allowance');
  } finally {
    if (had === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = had;
  }
});

test('both routes gate the claim on there being a key at all', () => {
  for (const file of ['coach', 'guide']) {
    const route = readCode(new URL(`../src/app/api/${file}/route.ts`, import.meta.url));
    assert.match(route, /aiConfigured\(\)/, `${file} must ask whether a call is possible`);
    assert.match(
      route,
      /configured\s*\n?\s*\?\s*await claimQuota[\s\S]{0,120}:\s*await peekQuota/,
      `${file} must claim only when configured, and peek otherwise`,
    );
    assert.match(route, /if \(configured && !quota\.allowed\)/, `${file} must not refuse on a quota it never spent`);
  }
});

test('the session carries nothing it does not use', () => {
  /*
   * `practiceAnswer` was declared on GameSession and never written or read
   * anywhere. It was also the one field `openSession` did not validate - so a
   * dead field was the only unvalidated thing in a signed token. Removed.
   */
  const session = readCode(new URL('../src/server/session.ts', import.meta.url));
  const iface = session.slice(session.indexOf('export interface GameSession'), session.indexOf('function secret'));
  const fields = [...iface.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(fields, ['seed', 'guesses', 'call'], `session carries ${fields.join(', ')}`);

  const opener = session.slice(session.indexOf('export function openSession'));
  for (const field of fields.filter((f) => f !== 'seed')) {
    assert.match(opener, new RegExp(`session\\.${field}`), `openSession must validate ${field}`);
  }
});
