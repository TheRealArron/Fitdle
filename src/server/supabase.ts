import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase access.
 *
 * Two clients, for two different jobs, and conflating them is the whole risk
 * this module exists to contain:
 *
 *   userIdFromRequest()  verifies WHO is asking, using the caller's own JWT and
 *                        the public anon key. It can read nothing it should not.
 *
 *   adminClient()        performs the write, using the service-role key, which
 *                        BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * The second one is why the streak can become authoritative: once the client
 * loses permission to write its own progress row, something has to be able to,
 * and that something must not be the browser.
 *
 * ┌─ Rules for the service-role key ──────────────────────────────────────────┐
 * │ 1. Never NEXT_PUBLIC_. It would be inlined into every visitor's bundle    │
 * │    and hand the whole database to anyone who opened devtools.            │
 * │ 2. Never construct the admin client from data the caller supplied.       │
 * │ 3. Every admin query scopes to a user id that came from a VERIFIED       │
 * │    token, never from the request body. RLS is not there to catch a       │
 * │    mistake here - it is switched off for this client.                    │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/** True when the server can write authoritative progress. */
export function cloudWritesConfigured(): boolean {
  return Boolean(url && anonKey && serviceKey);
}

let admin: SupabaseClient | null = null;

/**
 * The privileged client. Bypasses RLS - scope every query explicitly.
 *
 * Returns null rather than throwing when unconfigured: a deployment without a
 * service-role key should still serve the game, it just cannot bank streaks to
 * the cloud. Failing the whole guess endpoint over a missing optional key would
 * be a worse outcome than degrading to local-only play.
 */
export function adminClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  admin ??= createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Resolves the caller's user id from their `Authorization: Bearer <jwt>`.
 *
 * Verification is delegated to Supabase rather than decoded locally: a JWT's
 * payload is base64, not a proof, and `sub` read straight out of an unverified
 * token is a user id chosen by the attacker.
 *
 * Returns null for anonymous callers and for anything that fails to verify -
 * callers treat both as "play locally", never as "trust it anyway".
 */
export async function userIdFromRequest(request: Request): Promise<string | null> {
  if (!url || !anonKey) return null;

  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    // Network trouble reaching the auth server is not proof of identity.
    return null;
  }
}
