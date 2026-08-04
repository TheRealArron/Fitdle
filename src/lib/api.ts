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
 * its own origin. The Chrome extension needs it — a static export has no
 * server of its own, so it must call the deployed one.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export interface RevealedAnswer {
  name: string;
  display: string;
  group: MuscleGroup;
  equipment: Equipment;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
  howTo: string[];
  videoId: string | null;
  videoQuery: string;
  challenge: string;
}

export interface DailyState {
  seed: number;
  serverTime: string;
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  muscles: { shared: MuscleRegion[]; missed: MuscleRegion[] };
  status: 'playing' | 'won' | 'lost';
  hints: { category: MuscleGroup | null; equipment: Equipment | null; nextHintIn: number | null };
  reveal: RevealedAnswer | null;
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

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (res.status === 429) {
      return { ok: false, error: 'Too many requests — wait a moment.' };
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

export function isRejection(d: DailyState | GuessRejected): d is GuessRejected {
  return (d as GuessRejected).ok === false;
}
