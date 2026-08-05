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
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  assert.match(route, /userIdFromRequest\(request\)/);
  assert.ok(
    !/bankResult\(\s*body\.|bankResult\(\s*userId\s*\)\s*=>/.test(route),
    'a caller-supplied id is being banked',
  );
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
  const route = readFileSync(new URL('../src/app/api/guess/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(outcome\.status !== 'playing'\)/);
});

test('a cloud failure cannot cost a player their result', () => {
  // The result screen must render whether or not the row was written.
  assert.match(progressSource, /console\.error\('\[progress\] write failed'/);
  assert.match(progressSource, /return \{ save: next, written: false \}/);
});
