import 'server-only';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Signed game state.
 *
 * The server has to know how many guesses you have made — that gates the hints
 * and decides when the round ends — but keeping a row per player per day just
 * to count to six is a database write on every keystroke-completed guess.
 *
 * So the state travels with the request, signed. The client can read it (it is
 * base64 JSON, and it only contains guesses the player already made) but cannot
 * modify it: any edit invalidates the HMAC and the server starts them over.
 *
 * What this buys, concretely:
 *   - You cannot POST `{ status: 'won' }`. Status is derived server-side from
 *     the guesses in a token the server itself signed.
 *   - You cannot replay yesterday's token to re-open a finished puzzle: the
 *     seed is inside the signature.
 *   - You cannot skip to guess 5 to unlock the equipment hint early.
 *
 * The secret is server-only. Without it set the routes refuse to start rather
 * than fall back to unsigned state, because an unsigned token is worse than
 * none — it looks like a guarantee and is not one.
 */

const VERSION = 'v1';

export interface GameSession {
  /** YYYYMMDD. Binds the token to one puzzle. */
  seed: number;
  guesses: string[];
  /** Practice rounds carry their own answer; the daily never does. */
  practiceAnswer?: string;
}

function secret(): string {
  const s = process.env.FITDLE_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'FITDLE_SESSION_SECRET is missing or too short (need 32+ chars). ' +
        'Generate one with: openssl rand -base64 48',
    );
  }
  return s;
}

/** Present so a deployment can fail loudly at boot rather than per request. */
export function assertSessionSecret(): void {
  secret();
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function sealSession(session: GameSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${VERSION}.${payload}.${sign(`${VERSION}.${payload}`)}`;
}

/**
 * Returns null for anything that does not verify — a tampered token, a token
 * from another deployment, or one for a different day. Callers treat null as
 * "start a fresh game", never as "trust it anyway".
 */
export function openSession(token: string | undefined, expectedSeed: number): GameSession | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const [, payload, mac] = parts;
  const expected = sign(`${VERSION}.${payload}`);

  // Constant-time compare so the MAC cannot be brute-forced byte by byte.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as GameSession;
    if (session.seed !== expectedSeed) return null;
    if (!Array.isArray(session.guesses)) return null;
    if (!session.guesses.every((g) => typeof g === 'string' && /^[A-Z]{4,10}$/.test(g))) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** Convenience for local setup; never used at runtime. */
export function generateSecret(): string {
  return randomBytes(48).toString('base64');
}
