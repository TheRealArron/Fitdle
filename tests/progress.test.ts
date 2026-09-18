import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { commitResult, defaultSave, reconcile } from '@/lib/secureStorage';

/*
 * The server-authoritative streak.
 *
 * The write itself needs a live Supabase project with a service-role key, which
 * cannot exist in CI, so these pin the two things that CAN be checked without
 * one and that would silently reopen the hole if they regressed: the arithmetic
 * the server applies, and the key/permission boundary the design rests on.
 */

const serverSource = readFileSync(new URL('../src/server/supabase.ts', import.meta.url), 'utf8');
const progressSource = readFileSync(new URL('../src/server/progress.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const cloudSync = readFileSync(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8');

/* ── the key boundary ─────────────────────────────────────────────────────── */

test('the service-role key never reaches the browser', () => {
  /*
   * NEXT_PUBLIC_ is inlined at build time into every visitor's bundle. The
   * service-role key bypasses RLS completely, so publishing it would hand the
   * entire database to anyone who opened devtools - strictly worse than the
   * forgeable streak this change exists to fix.
   */
  assert.ok(
    !serverSource.includes('NEXT_PUBLIC_SUPABASE_SERVICE'),
    'the service-role key is read from a NEXT_PUBLIC_ variable',
  );
  assert.match(serverSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok(serverSource.startsWith("import 'server-only';"), 'missing the server-only guard');
});

test('privileged modules are server-only', () => {
  for (const [name, src] of [
    ['supabase.ts', serverSource],
    ['progress.ts', progressSource],
  ] as const) {
    assert.ok(src.startsWith("import 'server-only';"), `${name} is importable from the client`);
  }
});

test('identity comes from a verified token, not the request body', () => {
  /*
   * A JWT payload is base64, not a proof. Reading `sub` out of an unverified
   * token means the user id is chosen by the attacker - and since the admin
   * client bypasses RLS, that would be a total authorisation bypass rather than
   * a partial one.
   */
  assert.match(serverSource, /auth\.getUser\(token\)/, 'the token must be verified');
  assert.ok(
    !/JSON\.parse\(atob|jwtDecode|decodeJwt/.test(serverSource),
    'the token is decoded locally instead of verified',
  );
});

test('the banked user id comes from the verified caller', () => {
  /*
   * Asserts the property, not the helper's name: whatever it is called, the id
   * handed to bankResult must be derived from the request's verified token and
   * never from the request body.
   */
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  assert.match(
    route,
    /(verifiedUser|userIdFromRequest)\(request\)/,
    'identity is not resolved from the request',
  );
  assert.match(route, /bankResult\(\s*user\.id,/, 'the banked id is not the verified one');
  assert.ok(!/bankResult\(\s*body\./.test(route), 'a caller-supplied id is being banked');
});

/* ── the policy shape ─────────────────────────────────────────────────────── */

test('the schema revokes client insert and update on progress', () => {
  // The whole change rests on this. If these policies come back, the browser
  // can write its own streak again and everything above is decoration.
  assert.match(schema, /drop policy if exists "insert own progress"/);
  assert.match(schema, /drop policy if exists "update own progress"/);
  assert.ok(
    !/create policy "insert own progress"/.test(schema),
    'the insert policy is still created',
  );
  assert.ok(
    !/create policy "update own progress"/.test(schema),
    'the update policy is still created',
  );
});

test('the client keeps read and delete', () => {
  // Read, or sync breaks. Delete, or a player cannot remove their own data -
  // and a delete can only ever lower a streak, so it risks nothing.
  assert.match(schema, /create policy "read own progress"[\s\S]*?for select/);
  assert.match(schema, /create policy "delete own progress"[\s\S]*?for delete/);
});

test('syncSave no longer pushes', () => {
  // A client that wrote its merge back would be overwriting the authoritative
  // record with a number it computed itself.
  const fn = cloudSync.slice(cloudSync.indexOf('export async function syncSave'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(!body.includes('pushCloudSave'), 'syncSave still pushes to the cloud');
});

/* ── the arithmetic the server applies ────────────────────────────────────── */

test('banking the same round twice pays out once', () => {
  /*
   * Idempotence is inherited from commitResult rather than re-implemented, so
   * this pins the property the server relies on: a retried request, a
   * double-submitted guess, or a replayed winning call cannot inflate a streak.
   */
  let save = defaultSave();
  save = commitResult(reconcile(save, 20260806).save, 20260806, true, 3, true);
  assert.equal(save.streak, 1);
  assert.equal(save.played, 1);

  save = commitResult(reconcile(save, 20260806).save, 20260806, true, 1, true);
  assert.equal(save.streak, 1, 'a replayed round inflated the streak');
  assert.equal(save.played, 1);
  assert.equal(save.wins, 1);
});

test('the server applies the same order as the client: roll forward, then bank', () => {
  // Reconciling first is what breaks a streak for a missed day. Banking first
  // would credit the day and then roll it forward, quietly preserving it.
  let save = defaultSave();
  save = commitResult(reconcile(save, 20260801).save, 20260801, true, 3, true);
  assert.equal(save.streak, 1);

  const rolled = reconcile(save, 20260806); // five days skipped
  assert.equal(rolled.streakBroken, true);
  const after = commitResult(rolled.save, 20260806, true, 3, !rolled.clockRollback);
  assert.equal(after.streak, 1, 'the broken streak was not reset before banking');
});

test('a rolled-back clock earns no credit server-side either', () => {
  let save = defaultSave();
  save = commitResult(reconcile(save, 20260806).save, 20260806, true, 3, true);

  const back = reconcile(save, 20260701);
  assert.equal(back.clockRollback, true);
  const after = commitResult(back.save, 20260701, true, 1, !back.clockRollback);
  assert.equal(after.streak, 1, 'farming a past puzzle inflated the streak');
});

test('the server writes only when the round is over', () => {
  /*
   * Pins the guard around the call rather than the exact spelling of the
   * condition. The previous version matched `if (outcome.status !== 'playing')`
   * literally and broke the day a second clause was added to it - a failure
   * about punctuation, on a test whose subject is when a database write
   * happens. Matching the guard AND the call together keeps it about that.
   */
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  assert.match(
    route,
    /if \([^)]*outcome\.status !== 'playing'[^)]*\) \{\s*progress = await bankResult/,
    'bankResult must be reachable only once the round is over',
  );
  assert.equal(
    (route.match(/await bankResult/g) ?? []).length,
    1,
    'and there must be exactly one call to it',
  );
});

test('a cloud failure cannot cost a player their result', () => {
  // The result screen must render whether or not the row was written.
  assert.match(progressSource, /console\.error\('\[progress\] write failed'/);
  assert.match(progressSource, /return \{ save: next, written: false \}/);
});

/* ── the day record, and what the board ranks ─────────────────────────────── */

/*
 * These exist because the "Today" leaderboard could never contain a row.
 *
 * `reconcile` creates the day record and `commitResult` writes the counters -
 * neither touched `day`, so every row the server banked carried
 * `{guesses: [], status: 'playing'}` however the round actually went. The board
 * filters `day_won = true`. Verified against a live project: a player won, the
 * row read `day_won = false`, and the board query returned zero rows.
 *
 * Every test in this file until now read a source file. None of them could see
 * that, because it is a property of a blob the database derives columns from.
 */

test('a banked win produces a day record the board can rank', () => {
  const rolled = reconcile(defaultSave(), 20260917);
  const banked = commitResult(rolled.save, 20260917, true, 3, true);
  banked.day = { ...banked.day!, seed: 20260917, guesses: ['SQUAT', 'PLANK', 'LUNGE'], status: 'won', spent: 3 };

  // The two generated columns, evaluated the way Postgres would.
  assert.equal(banked.day.seed, 20260917, 'day_seed');
  assert.equal(banked.day.status === 'won', true, 'day_won must be true for a win');
  assert.equal(banked.day.spent ?? banked.day.guesses.length, 3, 'day_guesses');
});

test('a day record the server never wrote ranks nobody', () => {
  // The bug, pinned so it cannot come back: a reconciled-but-unwritten day is
  // always 'playing', and 'playing' is never 'won'.
  const rolled = reconcile(defaultSave(), 20260917);
  const banked = commitResult(rolled.save, 20260917, true, 3, true);
  assert.equal(banked.day!.status, 'playing', 'reconcile alone cannot produce a ranked row');
  assert.equal(
    (banked.day!.status as string) === 'won',
    false,
    'which is exactly why bankResult has to write the day itself',
  );
});

test('bankResult writes the day record, not just the counters', () => {
  const fn = progressSource.slice(progressSource.indexOf('export async function bankResult'));
  assert.match(fn, /next\.day = \{/, 'bankResult must write save.day or the daily board is empty');
  assert.match(fn, /status: won \? 'won' : 'lost'/, 'and must write the real status');
  assert.match(fn, /spent,/, 'and the ranked count');
});

test('the distribution records what the round cost, not the board length', () => {
  /*
   * Leg that survived the first mutation pass: swapping `spent` for
   * `guesses.length` in the `commitResult` call broke nothing, and it is the
   * difference between a restarted round going into the six-guess bucket and
   * into the one-guess bucket.
   *
   * `bankResult` cannot be called here - it needs a service-role client and a
   * live project - so this pins the argument. The behaviour itself was verified
   * against the live project: burn five, discard, win in one, and the row came
   * back `distribution [0,0,0,0,0,1]` with `day.spent = 6`.
   */
  const fn = progressSource.slice(progressSource.indexOf('export async function bankResult'));
  const call = /commitResult\(\s*rolled,\s*seed,\s*won,\s*([A-Za-z.]+)\s*,/.exec(fn);
  assert.ok(call, 'bankResult must still call commitResult');
  assert.equal(
    call[1],
    'spent',
    `commitResult is being handed ${call[1]}; a restart would then bank the short board`,
  );
});

test('the board ranks `spent`, which a restart cannot lower', () => {
  const column = schema.slice(schema.indexOf('add column day_guesses'));
  assert.match(
    column.slice(0, 400),
    /'spent'/,
    'day_guesses must prefer save.day.spent over the array the client can reset',
  );
  assert.match(
    schema,
    /drop column if exists day_guesses/,
    'the column already exists on a deployed project, so it must be dropped and re-added ' +
      'rather than "add if not exists", which would leave the old expression ranking',
  );
});

test('the guess route counts guesses per account, not off the token', () => {
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  assert.match(route, /spent:\$\{seed\}:\$\{user\.id\}/, 'keyed per account per day');
  assert.match(route, /Math\.max\(guesses\.length,/, 'the token can only raise the count, never lower it');
});
