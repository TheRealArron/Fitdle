import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, created lazily and only if the project is configured.
 *
 * The app must run with no backend at all - that is the default for anyone who
 * clones it, and the Chrome extension build ships without keys. So every call
 * site treats `null` as "cloud is unavailable" and falls back to local storage
 * rather than throwing. `isCloudConfigured()` is what the UI asks before it
 * offers an account.
 *
 * Setup: copy .env.example to .env.local and fill in the two values from your
 * Supabase project (Settings -> API), then run supabase/schema.sql in the SQL
 * editor. Both values are public by design; row-level security is what protects
 * the data, not the anon key.
 *
 * ┌─ Why the SDK is loaded dynamically ───────────────────────────────────────┐
 * │ @supabase/supabase-js is ~93 kB gzipped - roughly 40% of the whole        │
 * │ first-load payload - and it bundles gotrue AND realtime, which this app   │
 * │ has never opened a subscription to and which does not tree-shake out.     │
 * │                                                                          │
 * │ A signed-out player needs none of it. They do not sync, do not have a     │
 * │ session to refresh, and do not appear on a leaderboard. Loading it up     │
 * │ front makes every one of them wait for a library they will never call.    │
 * │                                                                          │
 * │ So the import is deferred, and `hasStoredSession()` answers "is there an  │
 * │ account here?" by reading one localStorage key - no SDK required. Only a  │
 * │ genuinely signed-in player pays the 93 kB, and they pay it after first    │
 * │ paint rather than before it.                                             │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Where supabase-js persists the session. Read directly by `hasStoredSession`. */
const STORAGE_KEY = 'fitdle-auth';

/**
 * In flight or resolved. Cached as the PROMISE rather than the client so
 * concurrent callers during startup share one import instead of racing to
 * construct several clients.
 */
let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Env only - never loads the SDK. Safe to call during render. */
export function isCloudConfigured(): boolean {
  return Boolean(url && anonKey);
}

/**
 * Is there a stored session, without paying 93 kB to find out?
 *
 * This is the whole optimisation. Call it before `getSupabase()` on any path
 * that only matters to signed-in players - a false answer means the SDK is
 * never fetched.
 *
 * Reading another library's storage key is a coupling, so it is pinned by a
 * test: if supabase-js ever changes where it persists, that test fails rather
 * than this silently returning false and signing everybody out.
 */
export function hasStoredSession(): boolean {
  if (!isCloudConfigured() || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Storage disabled or blocked. Assume no session; the worst case is that a
    // signed-in player looks signed out until they act, which is recoverable.
    return false;
  }
}

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!url || !anonKey || typeof window === 'undefined') return Promise.resolve(null);

  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The extension popup mounts and unmounts constantly; detecting a
          // session in the URL there would be meaningless and slows startup.
          detectSessionInUrl: true,
          storageKey: STORAGE_KEY,
        },
      }),
    )
    .catch(() => {
      // A failed chunk fetch must not permanently poison the singleton - the
      // next attempt should be allowed to retry.
      clientPromise = null;
      return null;
    });

  return clientPromise;
}

/** Turns Supabase's error strings into something a player should actually read. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  /*
   * Deliberately the SAME message for "no such account" and "wrong password".
   *
   * Supabase returns one error for both, on purpose. Splitting them would turn
   * the sign-in form into a user-enumeration oracle: anyone could type an email
   * and learn from the wording whether that person has an account here. That
   * leaks real information about real people, and it is why every serious auth
   * provider collapses the two.
   *
   * So instead of guessing which one it was, the copy covers both cases and
   * points at the fix for the one the player can act on.
   */
  if (m.includes('invalid login credentials')) {
    return 'No account matches that email and password. If you have not signed up yet, use Create account.';
  }
  if (m.includes('user already registered')) return 'An account with that email already exists.';
  if (m.includes('password should be at least')) {
    return 'Password needs to be at least 6 characters.';
  }
  if (m.includes('unable to validate email')) return 'That email address does not look valid.';
  if (m.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email first.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts - wait a minute and try again.';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection.';
  }
  return message;
}
