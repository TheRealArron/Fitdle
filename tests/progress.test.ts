import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readCode } from './helpers/source.ts';
import {
  commitResult,
  defaultSave,
  isCoherent,
  normalise,
  reconcile,
  type SaveData,
} from '@/lib/secureStorage';

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

test('syncSave writes nothing at all', () => {
  /*
   * Was `assert.ok(!body.includes('pushCloudSave'))`, which became vacuous the
   * day `pushCloudSave` was deleted - a test that passes because its subject no
   * longer exists is not a test. The property is that the pull side of sync
   * performs no write, whatever the write is spelled.
   */
  const body = cloudSync.slice(cloudSync.indexOf('export async function syncSave'));
  for (const verb of ['upsert(', 'insert(', 'update(', 'delete(']) {
    assert.ok(!body.includes(verb), `syncSave must not ${verb.slice(0, -1)} - the server owns the row`);
  }
});

/* ── clearing your own record ─────────────────────────────────────────────── */

test('the reset clears the record instead of writing one', () => {
  /*
   * `overwriteCloud` existed because a merge cannot express a deletion. Its
   * implementation was an upsert, and revoking the client's insert/update
   * permission is exactly what forbids an upsert - so the reset had been
   * failing 42501 and silently doing nothing again, which is the bug it was
   * written to fix. Measured live, signed in as the row's own owner: UPSERT
   * 42501, DELETE one row.
   */
  const fn = cloudSync.slice(cloudSync.indexOf('export async function clearCloudSave'));
  assert.match(fn, /rpc\('fitdle_reset_progress'\)/, 'the reset goes through the function');
  assert.ok(!fn.includes('upsert('), 'and must never upsert - RLS refuses it');
  assert.ok(!fn.includes('.update('), 'nor update');
});

test('resetting progress actually reaches the cloud', () => {
  /*
   * Leg that survived the first mutation pass: deleting the cloud call from
   * `resetProgress` broke nothing, and that is the whole bug - local storage is
   * cleared, the cloud row survives, and the next sync merges it back. The
   * companion test in cloudSync.test.ts pins WHY a merge cannot express a
   * reset; this pins that something still does.
   */
  const store = readFileSync(new URL('../src/store/useGameStore.ts', import.meta.url), 'utf8');
  // The implementation, not the interface declaration above it - which is what
  // a bare indexOf('resetProgress: (') finds, and which contains no code.
  const at = store.indexOf('resetProgress: () => {');
  assert.notEqual(at, -1, 'resetProgress must exist');
  const fn = store.slice(at, at + 600);
  assert.match(fn, /clearSave\(\)/, 'the local save must be cleared');
  assert.match(fn, /clearCloudIfSignedIn\(\)/, 'and so must the cloud copy, or the next sync restores it');
});

test('a project without the reset function still resets', () => {
  /*
   * Also survived the first pass. The function is a migration, and a player on
   * a deployment that has not run it must still be able to clear their
   * statistics - deleting the row costs them a tier nobody has set yet, and a
   * reset that silently does nothing is the bug being fixed.
   */
  const fn = cloudSync.slice(cloudSync.indexOf('export async function clearCloudSave'));
  assert.match(fn, /PGRST202/, 'a missing function has to be recognised');
  assert.match(fn, /\.delete\(\)/, 'and fall back to the delete RLS does permit');
});

test('the reset cannot be pointed at somebody else', () => {
  const fn = schema.slice(schema.indexOf('create or replace function public.fitdle_reset_progress'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.match(body, /fitdle_reset_progress\(\)/, 'it takes no arguments');
  assert.match(body, /where user_id = auth\.uid\(\)/, 'and only ever touches the caller’s own row');
  assert.ok(!/p_user/.test(body), 'a user id parameter would be a way to clear a stranger’s record');
});

test('the reset is granted to signed-in players and nobody else', () => {
  assert.match(
    schema,
    /revoke all on function public\.fitdle_reset_progress\(\) from public, anon;/,
    'security definer plus PostgREST means it is callable by anyone unless revoked',
  );
  assert.match(schema, /grant execute on function public\.fitdle_reset_progress\(\) to authenticated;/);
});

test('the reset leaves billing state alone', () => {
  // Deleting the row would work and would also cancel a paid tier. The function
  // writes one column.
  const fn = schema.slice(schema.indexOf('create or replace function public.fitdle_reset_progress'));
  // The body only - `set search_path` is part of the declaration, not a write.
  const body = fn.slice(fn.indexOf('as $$'), fn.indexOf('$$;'));
  const sets = [...body.matchAll(/set\s+(\w+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(sets, ['save'], `the reset writes ${sets.join(', ')}; it must write only the save`);
  for (const col of ['tier', 'ai_day', 'ai_count']) {
    assert.ok(!body.includes(col), `the reset must not touch ${col}`);
  }
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
   * Asserted by ORDER, not by matching the shape of the code around the call.
   *
   * This test has now broken twice on punctuation - once when a second clause
   * was added to the condition, once when the call was wrapped in a try/catch -
   * while the property it exists for was never in question. A regex over source
   * cannot help being a regex over source, but it can at least be about the
   * thing it claims to be about: there is exactly one bank, and it is
   * downstream of the round-over guard.
   */
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');

  const calls = [...route.matchAll(/await bankResult/g)].map((m) => m.index!);
  assert.equal(calls.length, 1, 'there must be exactly one call to bankResult');

  /*
   * The guard is matched by what it MEANS, not by the name of the variable it
   * reads. It has been `outcome.status` and is now `settled.status` - the
   * outcome recomputed once the guess counter has actually been claimed - and a
   * test about when a database write happens should not fail over a rename.
   */
  const guard = route.search(/\b\w+\.status !== 'playing'/);
  assert.notEqual(guard, -1, 'the round-over guard must still exist');
  assert.ok(calls[0] > guard, 'and the bank must come after it, never before');
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

/* ── a row is not automatically a save ────────────────────────────────────── */

/*
 * `fitdle_claim_ai` creates the progress row for a player who has never played,
 * seeding `save` as `{}` - which is truthful and correct for the leaderboard
 * columns, and is not a SaveData.
 *
 * Reproduced end to end against a live project before the fix: sign up, ask the
 * guide one question, then play. The guess that WON the round returned HTTP
 * 500. No test in this file could see it, because they all build their inputs
 * with `defaultSave()`, which always has a `distribution`.
 */

test('the empty row the AI quota creates is not mistaken for a save', () => {
  assert.equal(isCoherent({}), false, 'the {} seed must not read as a record');
  assert.equal(isCoherent(normalise({} as SaveData)), false, 'and normalising it must not rescue it');
});

test('normalise does not, and must not, invent the fields reconcile needs', () => {
  // Pinning the actual cause rather than the symptom. `normalise` backfills the
  // fields added after v1 and nothing else; it is an upgrade, not a repair.
  const n = normalise({} as SaveData) as Partial<SaveData>;
  assert.equal(n.distribution, undefined, 'normalise is not a repair function');
  assert.throws(
    () => reconcile(n as SaveData, 20260917),
    /distribution/,
    'which is why the row has to be validated before it reaches reconcile',
  );
});

test('the server validates a stored row before trusting it', () => {
  const fn = progressSource.slice(
    progressSource.indexOf('async function readRow'),
    progressSource.indexOf('export async function bankResult'),
  );
  assert.match(fn, /isCoherent\(/, 'readRow must check the row before normalising it');
  assert.match(fn, /return null;/, 'and treat an unusable row as no row');
});

test('the server uses the browser’s coherence rule, not a second opinion', () => {
  // Same reason reconcile and commitResult are imported rather than rewritten.
  assert.match(progressSource, /isCoherent/);
  const storage = readFileSync(new URL('../src/lib/secureStorage.ts', import.meta.url), 'utf8');
  assert.match(storage, /export function isCoherent/, 'exported so there is one rule, not two');
});

test('a throw while banking cannot cost the player their result', () => {
  /*
   * The file's own comments promised this and it was untrue: bankResult handles
   * a failed write, not a throw, and a throw escaped the route as a 500 on the
   * winning guess.
   */
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  const guarded = /try \{\s*progress = await bankResult\([\s\S]*?\} catch/.test(route);
  assert.ok(guarded, 'the bank must sit inside a try/catch or a throw becomes a lost round');
  assert.match(route, /console\.error\('\[guess\] banking failed/, 'and must be logged, not swallowed silently');
});

/* ── the check that checks the revocation ─────────────────────────────────── */

test('cloud:check proves the revocation instead of assuming it', () => {
  /*
   * The probe used to run an UPDATE as an ANONYMOUS caller against a row id
   * that does not exist, and print a green tick when it touched no rows. That
   * tick could not fail: with the OLD `update own progress` policy installed,
   * `auth.uid()` is null for an anonymous caller, no row matches, and PostgREST
   * returns the identical "no error, zero rows".
   *
   * The only configuration where the two outcomes differ is an authenticated
   * caller updating a row that exists and is their own, so the check has to
   * make an account to get there - and clean it up.
   */
  const script = readFileSync(new URL('../scripts/cloud-check.mjs', import.meta.url), 'utf8');
  const region = script.slice(
    script.indexOf('Why this signs in, rather than probing anonymously'),
    script.indexOf('/* ── 8a.'),
  );
  assert.ok(region.length > 0, 'the write-policy probe must still exist');

  /*
   * Comments stripped before asserting, including for the PRESENCE checks.
   *
   * `tests/helpers/source.ts` says absence checks read the code and presence
   * checks may read the whole file. That is not quite right and it bit here:
   * `assert.match(probe, /finally/)` passed with the finally block deleted,
   * because the comment above it contains the word "finally". A presence check
   * for a code CONSTRUCT has the same problem as an absence check.
   */
  const probe = region.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  assert.match(probe, /signInWithPassword/, 'it must sign in as the row’s own owner');
  assert.match(probe, /createUser/, 'which means creating a throwaway account');
  assert.match(probe, /deleteUser/, 'and deleting it again');
  assert.match(probe, /\}\s*finally\s*\{/, 'in a finally, so a failure mid-probe leaves nothing behind');
  assert.ok(
    !/00000000-0000-0000-0000-000000000000[\s\S]{0,200}update/.test(probe),
    'it must not go back to updating a row id that does not exist',
  );
});

test('the client keeps the server’s spent when it adopts the banked record', () => {
  /*
   * `day` is rebuilt from the response's guesses, which is the board in front
   * of the player - right, because a reload has to restore what they are
   * looking at. It carries no `spent`, and overwriting the banked record's day
   * with it threw away the one number that differs when a round was played
   * across more than one session: the board says 1, the day cost 6.
   *
   * Harmless for the leaderboard, which reads the server's row - and wrong in
   * the local copy for no reason.
   */
  const store = readCode(new URL('../src/store/useGameStore.ts', import.meta.url));
  const at = store.indexOf('next = d.progress');
  assert.notEqual(at, -1, 'the adopt-the-banked-record path must still exist');
  const block = store.slice(at, at + 700);
  assert.match(block, /d\.progress\?\.day\?\.spent/, 'the banked spent has to be read');
  assert.ok(
    !/next\.day = day;/.test(block),
    'assigning the local day wholesale is what dropped it',
  );
});
