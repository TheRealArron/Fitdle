import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, created lazily and only if the project is configured.
 *
 * The app must run with no backend at all — that is the default for anyone who
 * clones it, and the Chrome extension build ships without keys. So every call
 * site treats `null` as "cloud is unavailable" and falls back to local storage
 * rather than throwing. `isCloudConfigured()` is what the UI asks before it
 * offers an account.
 *
 * Setup: copy .env.example to .env.local and fill in the two values from your
 * Supabase project (Settings -> API), then run supabase/schema.sql in the SQL
 * editor. Both values are public by design; row-level security is what protects
 * the data, not the anon key.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The extension popup mounts and unmounts constantly; detecting a
        // session in the URL there would be meaningless and slows startup.
        detectSessionInUrl: true,
        storageKey: 'fitdle-auth',
      },
    });
  }
  return client;
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
    return 'Too many attempts — wait a minute and try again.';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection.';
  }
  return message;
}
