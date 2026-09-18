#!/usr/bin/env node
/**
 * Verifies a Supabase project is wired up correctly, end to end.
 *
 * This exists because the cloud path cannot be exercised without real
 * credentials, so it ships untested by construction. Rather than leave you to
 * discover a missing table or a bad policy through a silent sync failure in the
 * UI, this walks the whole chain and says exactly what is wrong:
 *
 *   keys present -> project reachable -> table exists -> RLS actually enforced
 *
 * Run it after pasting your keys into .env.local:  npm run cloud:check
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  warn: (s) => `\x1b[33m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
};

let failed = false;
const pass = (m, d = '') => console.log(`${c.ok('✓')} ${m}${d ? c.dim(`  ${d}`) : ''}`);
const fail = (m, fix) => {
  failed = true;
  console.log(`${c.bad('✗')} ${m}`);
  if (fix) console.log(`  ${c.warn('→')} ${fix}`);
};

/* ── 1. keys ──────────────────────────────────────────────────────────────── */

const envPath = path.join(root, '.env.local');
if (!existsSync(envPath)) {
  fail(
    '.env.local not found',
    'cp .env.example .env.local, then paste your Project URL and anon key from Supabase → Settings → API',
  );
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are empty',
    'Supabase → Settings → API → Project URL and anon/public key',
  );
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`URL does not look like a Supabase project URL: ${url}`, 'Expected https://<ref>.supabase.co');
  process.exit(1);
}
pass('keys present', url);

/* ── 2. reachable + anon auth works ───────────────────────────────────────── */

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, key, { auth: { persistSession: false } });

try {
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
    headers: { apikey: key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  pass('project reachable, anon key accepted');
} catch (e) {
  fail(`cannot reach the project (${e.message})`, 'Check the URL, the key, and that the project is not paused');
  process.exit(1);
}

/* ── 2b. the keys are the right way round ─────────────────────────────────── */

/*
 * Supabase's legacy keys are JWTs that state their own privilege in a `role`
 * claim, so which key you are holding is knowable rather than guessable.
 *
 * The case this exists for is the worst one available: the service_role key
 * pasted into NEXT_PUBLIC_SUPABASE_ANON_KEY. That ships a credential which
 * bypasses RLS to every visitor's browser, and it is not obviously wrong from
 * the outside - the app works perfectly, because a key with full access can do
 * everything the app asks of it. The RLS check below would fail, but with a
 * message about policies rather than about the key, which sends you to fix the
 * wrong thing.
 *
 * Newer sb_publishable_/sb_secret_ keys are opaque and carry no claim to read.
 * Their prefixes are already checked where they are used; this stays quiet
 * rather than guessing.
 */
function jwtRole(token) {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString()).role ?? null;
  } catch {
    return null;
  }
}

const anonRole = jwtRole(key);
if (anonRole === 'service_role') {
  fail(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY holds the service_role key',
    'That key bypasses RLS and NEXT_PUBLIC_ ships it to every browser. Replace it with the anon/publishable key and rotate the exposed one',
  );
} else if (anonRole === 'anon') {
  pass('anon key is really the anon key', 'role claim says so');
}

if (serviceKey) {
  const secretRole = jwtRole(serviceKey);
  if (secretRole === 'anon') {
    // RLS applies to it, so every server write is refused and the app looks
    // broken rather than misconfigured.
    fail(
      'SUPABASE_SERVICE_ROLE_KEY holds the anon key',
      'Server writes will be refused by RLS. Copy the service_role key instead',
    );
  } else if (secretRole === 'service_role') {
    pass('service_role key is really the service_role key', 'role claim says so');
  }
}

/* ── 3. table exists ──────────────────────────────────────────────────────── */

const probe = await supabase.from('fitdle_progress').select('user_id').limit(1);

if (probe.error) {
  const m = probe.error.message.toLowerCase();
  if (m.includes('does not exist') || probe.error.code === '42P01') {
    fail(
      'table public.fitdle_progress is missing',
      'Supabase → SQL Editor → paste supabase/schema.sql → Run',
    );
    process.exit(1);
  }
  // Any other error still means the table resolved.
  pass('table public.fitdle_progress exists');
  console.log(c.dim(`  (select returned: ${probe.error.message})`));
} else {
  pass('table public.fitdle_progress exists');
}

/* ── 4. RLS is actually enforced ──────────────────────────────────────────── */

/*
 * The anon key is public and ships in the browser bundle, so RLS is the only
 * thing standing between one player and everybody else's rows. If an
 * unauthenticated select returns data, the policies did not apply and the table
 * is world-readable - worth failing loudly over.
 */
if (!probe.error && Array.isArray(probe.data) && probe.data.length > 0) {
  fail(
    'RLS is NOT enforced - an unauthenticated read returned rows',
    'Re-run supabase/schema.sql; it enables RLS and creates the four owner-only policies',
  );
} else {
  pass('RLS enforced', 'anonymous reads return nothing, as they should');
}

/* ── 5. write is refused when signed out ──────────────────────────────────── */

const write = await supabase
  .from('fitdle_progress')
  .insert({ user_id: '00000000-0000-0000-0000-000000000000', save: {} });

/*
 * Read the error code, do not just check that one occurred.
 *
 * `user_id` is a foreign key to auth.users, and the probe UUID does not exist
 * there - so a naive "did it error?" test passes on a foreign-key violation
 * even when RLS is wide open. That would be a false pass on the one check that
 * actually matters, so the codes are distinguished:
 *
 *   42501 insufficient_privilege  -> RLS refused it. Genuine pass.
 *   23503 foreign_key_violation   -> the row got PAST RLS and was stopped by
 *                                    the constraint instead. RLS is not doing
 *                                    its job.
 *   no error                      -> nothing stopped it at all.
 */
const code = write.error?.code;

if (!write.error) {
  fail(
    'an anonymous INSERT succeeded - the table is writable by anyone',
    'Re-run supabase/schema.sql; it enables RLS and adds the owner-only insert policy',
  );
} else if (code === '42501' || /row-level security/i.test(write.error.message)) {
  pass('anonymous writes refused by RLS', '42501 insufficient_privilege');
} else if (code === '23503') {
  fail(
    'anonymous INSERT reached the foreign key - RLS did not block it',
    'The insert policy is missing or too permissive. Re-run supabase/schema.sql',
  );
} else {
  // Something else refused it. Not a pass, but not proof of a hole either.
  console.log(
    `${c.warn('?')} anonymous write was refused, but not by RLS ${c.dim(
      `(${code ?? 'no code'}: ${write.error.message.slice(0, 60)})`,
    )}`,
  );
  console.log(`  ${c.warn('→')} Confirm RLS is enabled on public.fitdle_progress in the dashboard`);
}

/* ── 6. the server can write, and only the server ─────────────────────────── */

/*
 * This is the check that matters now.
 *
 * The streak became authoritative by REVOKING the client's insert/update
 * permission and moving writes to the API under the service-role key. A project
 * still running the old schema keeps those policies, so the browser can still
 * write its own row - and the app will look completely fine while a forged
 * streak sails straight through. Nothing else would catch that.
 */
if (!serviceKey) {
  console.log(
    `${c.warn('?')} SUPABASE_SERVICE_ROLE_KEY is not set ${c.dim('(streaks stay local-only)')}`,
  );
  console.log(
    `  ${c.warn('→')} Supabase → Settings → API → service_role key. Server-only: never NEXT_PUBLIC_`,
  );
} else if (serviceKey === key) {
  /*
   * Compared regardless of format. This used to be guarded by /^ey/, which only
   * matched the old JWT-style keys - so once Supabase introduced the
   * sb_publishable_/sb_secret_ format, pasting the publishable key into the
   * secret slot passed this check silently. The failure mode it exists to catch
   * is unchanged by the key format, so the test should not depend on it.
   */
  fail(
    'SUPABASE_SERVICE_ROLE_KEY is the same value as the anon key',
    'Copy the secret (service_role) key, not the publishable/anon one',
  );
} else if (/^sb_publishable_/.test(serviceKey)) {
  // Browser-safe by design, so it cannot write authoritative streaks and every
  // server write will be refused by RLS - which looks like a broken app.
  fail(
    'SUPABASE_SERVICE_ROLE_KEY holds a publishable key',
    'That one is public and RLS applies to it. Use the key labelled secret / service_role',
  );
} else {
  pass('service-role key present', 'the API can write authoritative streaks');
}

/*
 * The policy probe. An anonymous insert already had to fail; the NEW property
 * is that it must fail with 42501 rather than reaching the foreign key, because
 * reaching the FK means an insert policy still exists and is letting rows past.
 */
/*
 * ── Why this signs in, rather than probing anonymously ──────────────────────
 *
 * The previous version of this check ran an UPDATE as an ANONYMOUS caller
 * against a row id that does not exist, and printed a green tick when it
 * touched no rows. That tick could not fail. With the OLD `update own progress`
 * policy still installed, `auth.uid()` is null for an anonymous caller, so no
 * row matches, so PostgREST returns exactly the same "no error, zero rows" -
 * and the check would have said "client writes are revoked" on a project where
 * they were not.
 *
 * That is the one property this whole script exists for: a project running the
 * old schema looks completely fine while forged streaks sail through.
 *
 * Proving it needs the only configuration where the two outcomes differ: an
 * AUTHENTICATED caller updating a row that exists and is their own. With the
 * policy gone the update is invisible to them (zero rows, and the value is
 * unchanged); with the policy present it succeeds. There is no way to reach
 * that configuration without an account, so this makes one.
 *
 * The account is created with the service-role key, used, and deleted in a
 * `finally`. If the deletion ever fails the id is printed loudly, because a
 * leftover probe account in your auth table is exactly the kind of thing a
 * tool should not leave behind quietly.
 */
if (serviceKey) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const email = `fitdle-cloudcheck-${Date.now()}@example.invalid`;
  const password = `Ck-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}!A`;
  let probeId = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error || !created.data?.user) {
      console.log(
        `${c.warn('?')} could not test the write policies ${c.dim(
          `(${created.error?.message.slice(0, 60) ?? 'no user returned'})`,
        )}`,
      );
      console.log(
        `  ${c.warn('→')} This check signs in as a throwaway account to prove the revocation. Without it, nothing here can tell the new policies from the old ones`,
      );
    } else {
      probeId = created.data.user.id;

      // The server's own write, so there is a real row belonging to the probe.
      const seeded = await admin
        .from('fitdle_progress')
        .upsert({ user_id: probeId, save: { marker: 'cloud-check' } }, { onConflict: 'user_id' });

      if (seeded.error) {
        console.log(
          `${c.warn('?')} could not seed a row to test against ${c.dim(seeded.error.message.slice(0, 60))}`,
        );
      } else {
        const asOwner = createClient(url, key, { auth: { persistSession: false } });
        const signIn = await asOwner.auth.signInWithPassword({ email, password });

        if (signIn.error) {
          console.log(
            `${c.warn('?')} could not sign in as the probe account ${c.dim(signIn.error.message.slice(0, 60))}`,
          );
        } else {
          const attack = await asOwner
            .from('fitdle_progress')
            .update({ save: { marker: 'forged', streak: 9999 } })
            .eq('user_id', probeId)
            .select();

          // Read back with the service-role key: what the row actually says is
          // the only answer that cannot be argued with.
          const after = await admin
            .from('fitdle_progress')
            .select('save')
            .eq('user_id', probeId)
            .maybeSingle();
          const forged = after.data?.save?.marker === 'forged';

          if (forged || (!attack.error && (attack.data ?? []).length > 0)) {
            fail(
              'a signed-in player CAN rewrite their own progress row - the old write policies are still in place',
              'Re-run supabase/schema.sql; it drops "insert own progress" and "update own progress". Until then any streak on the leaderboard is whatever the browser typed',
            );
          } else if (attack.error?.code === '42501') {
            pass('client writes are revoked', 'the row’s own owner was refused 42501');
          } else if (!attack.error) {
            pass(
              'client writes are revoked',
              'the row’s own owner updated 0 rows and the record is unchanged',
            );
          } else {
            console.log(
              `${c.warn('?')} the owner's update was refused, but not by RLS ${c.dim(
                `(${attack.error.code ?? 'no code'}: ${attack.error.message.slice(0, 50)})`,
              )}`,
            );
          }
        }
      }
    }
  } catch (err) {
    console.log(
      `${c.warn('?')} the write-policy check could not run ${c.dim(
        err instanceof Error ? err.message.slice(0, 60) : String(err),
      )}`,
    );
  } finally {
    if (probeId) {
      await admin.from('fitdle_progress').delete().eq('user_id', probeId);
      const removed = await admin.auth.admin.deleteUser(probeId);
      if (removed.error) {
        console.log(
          c.bad(`! could not delete the probe account ${probeId} - remove it in Supabase → Authentication`),
        );
      }
    }
  }
}

/* ── 7. the AI quota columns ──────────────────────────────────────────────── */

/*
 * Without these, the per-account quota cannot be persisted. It degrades to the
 * anonymous allowance rather than to unlimited - but that is a fallback, not
 * the intended behaviour, and it is invisible from the UI.
 */
const quotaProbe = await supabase.from('fitdle_progress').select('tier, ai_day, ai_count').limit(1);

if (quotaProbe.error?.code === '42703') {
  fail(
    'the AI quota columns are missing (tier, ai_day, ai_count)',
    'Re-run supabase/schema.sql. Until then every signed-in player falls back to the 2-question anonymous allowance',
  );
} else {
  pass('AI quota columns present', 'per-account limits can be persisted');
}

/* ── 8. the atomic quota claim ────────────────────────────────────────────── */

/*
 * The function that stops two simultaneous requests both spending the last AI
 * message. Its absence is silent in exactly the wrong direction: the app falls
 * back to the 2-question anonymous allowance for every signed-in player, which
 * looks like a stingy free tier rather than a missing migration.
 *
 * Probed with a random uuid, which is safe and creates nothing: the function's
 * first statement inserts a progress row referencing auth.users, so an id that
 * belongs to nobody is refused by the foreign key. That refusal is the proof -
 * to violate the constraint, the function had to exist and run.
 */
if (serviceKey) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const probe = await admin.rpc('fitdle_claim_ai', {
    p_user: '00000000-0000-4000-8000-000000000000',
    p_day: 0,
    p_free: 5,
    p_pro: 100,
    p_consume: false,
  });

  const code = probe.error?.code ?? '';
  const message = probe.error?.message ?? '';

  if (code === '23503' || /violates foreign key/i.test(message)) {
    pass('atomic quota claim installed', 'fitdle_claim_ai ran; the AI limit cannot be raced');
  } else if (code === 'PGRST202' || code === '42883' || /Could not find the function/i.test(message)) {
    fail(
      'the function fitdle_claim_ai is missing',
      'Re-run supabase/schema.sql. Until then every signed-in player falls back to the 2-question anonymous allowance',
    );
  } else if (probe.error) {
    fail(`fitdle_claim_ai failed: ${message}`, 'Re-run supabase/schema.sql and check the SQL editor output');
  } else {
    pass('atomic quota claim installed', 'fitdle_claim_ai answered');
  }
}

/* ── 8a. clearing your own record ─────────────────────────────────────────── */

/*
 * Without this function "reset my statistics" cannot reach the cloud copy.
 * The client has no insert or update permission - that is the point - so the
 * old upsert fails 42501, the local save is cleared, the cloud row survives,
 * and the next sync merges it straight back in. The reset appears to work and
 * is silently undone, which is the exact bug `overwriteCloud` was written to
 * fix and which came back when the write permission went away.
 *
 * The app falls back to deleting the row, so a stale project still resets - it
 * just takes `tier` and the AI counters with it.
 *
 * Probed with the anon key, unauthenticated: the function reads `auth.uid()`
 * itself and raises 42501 when there is nobody signed in. That refusal is the
 * proof - to raise it, the function had to exist, be callable, and run.
 */
const resetProbe = await supabase.rpc('fitdle_reset_progress');
const resetCode = resetProbe.error?.code ?? '';
const resetMessage = resetProbe.error?.message ?? '';

if (resetCode === '42501' || /not authenticated/i.test(resetMessage)) {
  pass('reset-my-statistics can reach the cloud', 'fitdle_reset_progress refused an anonymous caller');
} else if (
  resetCode === 'PGRST202' ||
  resetCode === '42883' ||
  /could not find the function/i.test(resetMessage)
) {
  fail(
    'the function fitdle_reset_progress is missing',
    'Re-run supabase/schema.sql. Until then "reset my statistics" falls back to deleting the whole row, which also clears tier and the AI counters',
  );
} else if (!resetProbe.error) {
  fail(
    'fitdle_reset_progress ran for an UNAUTHENTICATED caller',
    'It must raise when auth.uid() is null. Re-run supabase/schema.sql and check the grants',
  );
} else {
  console.log(
    `${c.warn('?')} fitdle_reset_progress refused, but not as expected ${c.dim(
      `(${resetCode || 'no code'}: ${resetMessage.slice(0, 60)})`,
    )}`,
  );
}

/* ── 8b. the daily board ranks what the round cost ────────────────────────── */

/*
 * `day_guesses` used to be `jsonb_array_length(save -> 'day' -> 'guesses')`,
 * which is the number a player can reset by discarding their session and
 * starting the day over - measured: burn five guesses, discard, win in one, and
 * the round banks as a one-guess win. The server now counts per account and
 * writes the total as `save.day.spent`, and the column has to prefer it.
 *
 * A stale project is invisible from the UI: the board renders, the ranks look
 * plausible, and they are the forgeable number.
 *
 * PostgREST cannot read a column's definition, so this checks the column's
 * BEHAVIOUR against the blob it is derived from - any row where they disagree
 * proves the old expression is still installed. With no banked rounds yet there
 * is nothing to compare, and this says so rather than passing.
 */
if (serviceKey) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rows = await admin
    .from('fitdle_progress')
    .select('day_guesses, save')
    .not('save->day->spent', 'is', null)
    .limit(50);

  if (rows.error) {
    console.log(
      `${c.warn('?')} could not read banked rounds ${c.dim(`(${rows.error.message.slice(0, 60)})`)}`,
    );
  } else if ((rows.data ?? []).length === 0) {
    console.log(
      `${c.warn('?')} daily board ranking not checked ${c.dim('(no banked rounds to compare against yet)')}`,
    );
    console.log(
      `  ${c.warn('→')} Re-run supabase/schema.sql if you have not since the day_guesses change, then finish a round and re-run this`,
    );
  } else {
    const wrong = rows.data.filter((r) => r.day_guesses !== r.save?.day?.spent);
    if (wrong.length > 0) {
      fail(
        `day_guesses ranks the guess ARRAY, not what the round cost (${wrong.length} of ${rows.data.length} rows disagree)`,
        'Re-run supabase/schema.sql; it drops and re-adds day_guesses. Until then the daily board ranks a number players can reset',
      );
    } else {
      pass(
        'the daily board ranks what the round cost',
        `day_guesses matches save.day.spent on ${rows.data.length} row(s)`,
      );
    }
  }
}

/* ── 9. the shared rate-limit counter ─────────────────────────────────────── */

/*
 * Optional. Without it every rate limit counts inside one process, so a fleet
 * of N instances enforces N times the limit and all of them reset on a cold
 * start. The app is built to fall back to exactly that, so an unset counter is
 * a warning rather than a failure.
 *
 * Checked by actually incrementing a throwaway key twice and confirming the
 * second call sees the first. A reachability ping would pass against a database
 * that rejects the script, and a misconfigured counter that silently returns
 * nothing is indistinguishable from no counter at all - which is the whole
 * failure mode worth catching.
 */
const redisUrl = env.UPSTASH_REDIS_REST_URL;
const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl && !redisToken) {
  console.log(
    `${c.warn('?')} no shared rate-limit counter ${c.dim('(limits count per instance and reset on cold start)')}`,
  );
  console.log(`  ${c.warn('→')} Optional. console.upstash.com → create a Redis database → copy the REST url and token`);
} else if (!redisUrl || !redisToken) {
  fail(
    'only one of UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN is set',
    'Set both or neither. Half-configured is treated as unconfigured, so the limit stays per-instance',
  );
} else if (/^rediss?:\/\//.test(redisUrl)) {
  fail(
    'UPSTASH_REDIS_REST_URL is the redis:// connection string',
    'That is the TCP endpoint. Copy the REST URL instead - it starts with https://',
  );
} else {
  const probeKey = `fitdle:cloudcheck:${Date.now()}`;
  const script = `local n = redis.call('INCR', KEYS[1])\nif n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end\nreturn n`;

  const call = () =>
    fetch(`${redisUrl.replace(/\/+$/, '')}/eval`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([script, 1, probeKey, '30']),
      signal: AbortSignal.timeout(5_000),
    });

  try {
    const first = await call();
    if (first.status === 401 || first.status === 403) {
      fail('Upstash rejected the token', 'Copy the REST token that belongs to this database');
    } else if (!first.ok) {
      fail(`Upstash responded ${first.status}`, 'Check the REST URL belongs to the same database as the token');
    } else {
      const a = (await first.json()).result;
      const b = (await (await call()).json()).result;
      // Two calls, two different numbers: the counter is real and it remembers.
      if (Number(a) === 1 && Number(b) === 2) {
        pass('shared rate-limit counter works', 'limits are enforced across instances and survive restarts');
      } else {
        fail(
          `the counter did not increment as expected (got ${a} then ${b})`,
          'Expected 1 then 2. Confirm the URL and token belong to the same Redis database',
        );
      }
    }
  } catch (err) {
    fail(
      `Upstash unreachable: ${err instanceof Error ? err.message : err}`,
      'The app falls back to per-instance counting, so this degrades the limit rather than breaking the game',
    );
  }
}

console.log();
if (failed) {
  console.log(c.bad('Cloud sync is not ready.'), 'Fix the items above and run again.');
  process.exit(1);
}
console.log(c.ok('Cloud sync is ready.'), 'Sign up in the app and your streak will follow you.');
