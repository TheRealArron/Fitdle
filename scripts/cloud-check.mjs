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
 * is world-readable — worth failing loudly over.
 */
if (!probe.error && Array.isArray(probe.data) && probe.data.length > 0) {
  fail(
    'RLS is NOT enforced — an unauthenticated read returned rows',
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
 * there — so a naive "did it error?" test passes on a foreign-key violation
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
    'an anonymous INSERT succeeded — the table is writable by anyone',
    'Re-run supabase/schema.sql; it enables RLS and adds the owner-only insert policy',
  );
} else if (code === '42501' || /row-level security/i.test(write.error.message)) {
  pass('anonymous writes refused by RLS', '42501 insufficient_privilege');
} else if (code === '23503') {
  fail(
    'anonymous INSERT reached the foreign key — RLS did not block it',
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

console.log();
if (failed) {
  console.log(c.bad('Cloud sync is not ready.'), 'Fix the items above and run again.');
  process.exit(1);
}
console.log(c.ok('Cloud sync is ready.'), 'Sign up in the app and your streak will follow you.');
