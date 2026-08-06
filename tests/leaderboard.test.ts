import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The leaderboard.
 *
 * Ranking needs a live database, so these pin the parts that do not: the
 * privacy boundary, the index/query agreement, and the honesty of what each
 * board claims to measure. Every one of these would fail silently in production
 * - a leaked id looks like a working leaderboard, and a query with no index
 * looks fine until it does not.
 */

const board = readFileSync(new URL('../src/server/leaderboard.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app/api/leaderboard/route.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/Leaderboard.tsx', import.meta.url), 'utf8');

/* ── privacy ──────────────────────────────────────────────────────────────── */

test('no user id can reach the client', () => {
  /*
   * The board runs under the service-role key, which bypasses RLS, so the shape
   * of what leaves the module is the only thing between a leaderboard and a
   * leak. A stable public identifier is a correlation key, and a leaderboard is
   * exactly where someone would collect them.
   */
  const entry = board.slice(board.indexOf('function toEntry'), board.indexOf('const EMPTY'));
  assert.ok(!/user_id\s*[,:]/.test(entry.replace(/row\.user_id === userId/, '')),
    'toEntry emits a user id');
  assert.match(entry, /isYou:/, 'identity must leave as a boolean');
});

test('the public type has no id field', () => {
  const iface = board.slice(board.indexOf('export interface BoardEntry'), board.indexOf('export interface Board '));
  for (const leaky of ['id', 'userId', 'user_id', 'email']) {
    assert.ok(!new RegExp(`\\b${leaky}\\b\\s*:`).test(iface), `BoardEntry exposes ${leaky}`);
  }
});

test('"is this me" is decided server-side', () => {
  // If the client had to work it out, it would need the ids to do it with - so
  // the comparison happens here and only a boolean crosses the wire.
  assert.match(board, /row\.user_id === userId/);

  const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
  const iface = api.slice(api.indexOf('export interface BoardEntry'), api.indexOf('export interface LeaderboardData'));
  assert.match(iface, /isYou: boolean;/, 'the client type must carry the verdict, not the inputs');
  assert.ok(
    !/user_?[Ii]d/.test(iface),
    'the client type carries an id it could compare itself',
  );
});

test('usernames are shape-limited before display', () => {
  /*
   * Arbitrary text a stranger chose, rendered to every other player. React
   * escapes it, so this is about layout rather than script injection - an
   * unbounded name could push a wall of text or fake another row.
   */
  assert.match(board, /\.slice\(0, 20\)/);
  assert.match(board, /replace\(\/\\s\+\/g, ' '\)/);
  assert.match(board, /ANONYMOUS/);
});

/* ── the queries match the indexes ────────────────────────────────────────── */

test('the streak board has a matching index', () => {
  assert.match(board, /\.order\('streak', \{ ascending: false \}\)/);
  assert.match(board, /\.order\('updated_at', \{ ascending: true \}\)/);
  assert.match(schema, /create index if not exists fitdle_streak_board[\s\S]*?streak desc, updated_at asc/);
});

test('the daily board has a matching index', () => {
  assert.match(board, /\.eq\('day_seed', seed\)/);
  assert.match(board, /\.order\('day_guesses', \{ ascending: true \}\)/);
  assert.match(schema, /create index if not exists fitdle_daily_board[\s\S]*?day_seed, day_guesses asc, updated_at asc/);
});

test('ranking columns are generated from the save, not written separately', () => {
  /*
   * The whole point. A hand-maintained `streak` column drifts from the save
   * within a week, and then the board ranks something that is not the record.
   */
  for (const col of ['streak', 'max_streak', 'day_seed', 'day_guesses', 'day_won']) {
    assert.match(
      schema,
      new RegExp(`${col} \\w+\\s*\\n?\\s*generated always as`),
      `${col} is not a generated column`,
    );
  }
});

test('username is the one denormalised column, and refreshed on every bank', () => {
  // It cannot be generated: it lives in auth.users, which nobody may read for
  // another account.
  assert.match(schema, /add column if not exists username text/);
  const progress = readFileSync(new URL('../src/server/progress.ts', import.meta.url), 'utf8');
  assert.match(progress, /\.\.\.\(username \? \{ username \} : \{\}\)/);
});

/* ── honesty about what is measured ───────────────────────────────────────── */

test('the daily board ranks guesses, and says so', () => {
  /*
   * Not solve time. Nothing records when a player started, and anything that
   * did would reset by discarding the session and asking for a fresh one - so a
   * "fastest" board would rank whoever worked that out. Guess count is already
   * measured and already unforgeable.
   */
  assert.match(board, /NOT by how fast/);
  assert.match(ui, /fewest guesses first/i);
  assert.ok(!/fastest|seconds|duration/i.test(ui), 'the UI claims to measure speed');
});

/* ── the route ────────────────────────────────────────────────────────────── */

test('the board is read-only and rate limited', () => {
  assert.ok(!/export async function POST/.test(route), 'the board accepts writes');
  assert.match(route, /export async function GET/);
  assert.match(route, /rateLimit\(/);
});

test('auth is optional and degrades rather than failing', () => {
  // A public board must not disappear because a JWT expired.
  assert.match(route, /userIdFromRequest\(request\)/);
  assert.ok(!/401|403/.test(route), 'the route rejects unauthenticated callers');
});

test('the response is never cached', () => {
  // A shared cache would serve one player's isYou flags to everybody else.
  assert.match(route, /'Cache-Control': 'no-store'/);
});

test('the board module is server-only', () => {
  assert.ok(board.startsWith("import 'server-only';"));
});

/* ── the deferred auth SDK ────────────────────────────────────────────────── */

test('the Supabase SDK is imported dynamically, not statically', () => {
  /*
   * ~59 kB gzipped that a signed-out player never calls. A static import puts
   * it in the first-load chunk for everyone; this keeps it behind a real need.
   * `npm run check:size` enforces the resulting budget.
   */
  const lib = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
  assert.match(lib, /import type \{ SupabaseClient \}/, 'the type import must be erased');
  assert.ok(
    !/^import \{[^}]*createClient/m.test(lib),
    'createClient is imported statically, which defeats the split',
  );
  assert.match(lib, /await import\('@supabase\/supabase-js'\)|import\('@supabase\/supabase-js'\)/);
});

test('the storage-key coupling is pinned', () => {
  /*
   * `hasStoredSession` reads supabase-js's own persistence key to answer "is
   * anyone signed in?" without loading the SDK. That is a coupling to another
   * library's internals, so the two must agree - if they drift, every
   * signed-in player silently looks signed out.
   */
  const lib = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
  const declared = /const STORAGE_KEY = '([^']+)'/.exec(lib)?.[1];
  assert.ok(declared, 'STORAGE_KEY is not declared');
  assert.match(lib, new RegExp(`storageKey: STORAGE_KEY`), 'the client uses a different key');
  assert.match(lib, /getItem\(STORAGE_KEY\)/, 'the probe reads a different key');
});

test('an anonymous player never triggers the SDK load', () => {
  // init() must bail before touching getSupabase when there is no session.
  const store = readFileSync(new URL('../src/store/useAuthStore.ts', import.meta.url), 'utf8');
  // Slice from the IMPLEMENTATION, not the interface declaration above it -
  // `signUp:` appears in both, and searching the whole file finds the wrong one.
  const from = store.indexOf('init: async');
  const init = store.slice(from, store.indexOf('signUp: async', from));
  const gate = init.indexOf('hasStoredSession()');
  const load = init.indexOf('await getSupabase()');
  assert.ok(gate > 0 && load > gate, 'getSupabase runs before the stored-session gate');
});
