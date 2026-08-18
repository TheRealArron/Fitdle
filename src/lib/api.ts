import type { Equipment, MuscleGroup, MuscleRegion } from '@/data/muscles';
import type { LetterState } from '@/lib/evaluate';

/**
 * Client half of the authoritative game.
 *
 * Every daily guess is scored by the server. The browser never learns which
 * exercise is today's answer until the server sends `reveal`, and it only does
 * that once the round is genuinely over.
 *
 * `NEXT_PUBLIC_API_URL` lets a build point at a deployed instance rather than
 * its own origin. The Chrome extension needs it - a static export has no
 * server of its own, so it must call the deployed one.
 */
/*
 * Re-exported so components can keep importing response types from the module
 * that produces them, without every component learning where the contract
 * lives. `contracts.ts` stays the single declaration.
 */
export type {
  AiReply,
  BoardEntry,
  LeaderboardResponse,
  QuotaState,
  RevealedAnswer,
} from '@/lib/contracts';

import type {
  AiReply,
  BoardKind,
  LeaderboardResponse,
  RevealedAnswer,
} from '@/lib/contracts';
import type { SaveData } from '@/lib/secureStorage';
import { getSupabase, hasStoredSession } from '@/lib/supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';


export interface DailyState {
  seed: number;
  serverTime: string;
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  muscles: { shared: MuscleRegion[]; missed: MuscleRegion[] };
  status: 'playing' | 'won' | 'lost';
  hints: { category: MuscleGroup | null; equipment: Equipment | null; nextHintIn: number | null };
  /** The opening call and how it went. Null when none was made. */
  call: { group: MuscleGroup; correct: boolean } | null;
  reveal: RevealedAnswer | null;
  /**
   * The server's authoritative record, returned when a signed-in player
   * finishes a round. Null for anonymous play or an unconfigured deployment.
   */
  progress?: SaveData | null;
  /** Signed, opaque. Round-tripped on the next guess. */
  state: string;
}

export interface GuessRejected {
  ok: false;
  reason: 'length' | 'unknown' | 'duplicate' | 'finished';
  message: string;
  state: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The signed-in player's access token, if there is one.
 *
 * Sent so the server can bank the streak against the right account. It is the
 * player's own JWT - the server verifies it rather than trusting the `sub`
 * inside it, so a forged token buys nothing.
 */
async function bearerToken(): Promise<string | null> {
  /*
   * The cheap check first. A signed-out player has no token to send, so there
   * is no reason to fetch 93 kB of auth SDK to discover that - and signed-out
   * is the common case on a daily puzzle.
   */
  if (!hasStoredSession()) return null;

  const supabase = await getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const token = await bearerToken();
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (res.status === 429) {
      return { ok: false, error: 'Too many requests - wait a moment.' };
    }
    if (!res.ok) {
      return { ok: false, error: `Server error (${res.status})` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    // Offline, blocked, or the deployment is down. The caller decides what to
    // do; it must never be "assume they won".
    return { ok: false, error: 'Could not reach the server.' };
  }
}

/** Opens or resumes today's puzzle. */
export function fetchToday(state?: string): Promise<ApiResult<DailyState>> {
  return post<DailyState>('/api/today', state ? { state } : {});
}

/** Submits one guess. A rejection is a successful response with `ok: false`. */
export function submitGuess(
  guess: string,
  state: string,
): Promise<ApiResult<DailyState | GuessRejected>> {
  return post<DailyState | GuessRejected>('/api/guess', { guess, state });
}

/** Locks in the opening muscle-group call. Server refuses it after guess 1. */
export function placeCall(group: string, state: string): Promise<ApiResult<DailyState>> {
  return post<DailyState>('/api/call', { group, state });
}

/** Asks the coach about the day's exercise. Server refuses until the round ends. */
export function askCoach(question: string, state: string): Promise<ApiResult<AiReply>> {
  return post('/api/coach', { question, state });
}

/** Asks the in-game guide how something works. No round gate - it knows no answers. */
export function askGuide(question: string): Promise<ApiResult<AiReply>> {
  return post('/api/guide', { question });
}

/** Public boards. Auth is optional; signing in adds `isYou` and your standing. */
export async function fetchBoard(
  which: BoardKind,
): Promise<ApiResult<LeaderboardResponse>> {
  try {
    const token = await bearerToken();
    const res = await fetch(`${BASE}/api/leaderboard?board=${which}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Server error (${res.status})` };
    return { ok: true, data: (await res.json()) as LeaderboardResponse };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

export function isRejection(d: DailyState | GuessRejected): d is GuessRejected {
  return (d as GuessRejected).ok === false;
}
