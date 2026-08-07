/**
 * The wire contract between the API routes and the browser.
 *
 * Deliberately in `lib/` and deliberately WITHOUT `import 'server-only'`, so
 * both sides can import the same declarations. Everything under `src/server/`
 * carries that marker and is unreachable from a client component - which is
 * correct for logic and secrets, and is exactly why the response shapes could
 * not live there.
 *
 * Before this existed, `QuotaState` and `BoardEntry` were declared twice, once
 * on each side. They happened to agree, which is the dangerous version of the
 * problem: nothing would have caught the day they stopped. A server adding a
 * field is harmless; a server *changing what a field means* while the client
 * keeps the old reading is a bug no type checker would see, because both files
 * type-check perfectly against themselves.
 *
 * Types only. No values, no logic - anything executable here would end up in
 * the client bundle whether the client needed it or not.
 */

import type { Equipment, MuscleGroup, MuscleRegion } from '@/data/muscles';

/* ── AI quota ─────────────────────────────────────────────────────────────── */

export type Tier = 'free' | 'pro';

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  tier: Tier | 'anonymous';
}

/** Common shape of both AI endpoints. `quota` is absent only on hard errors. */
export interface AiReply {
  status: string;
  text: string;
  quota?: QuotaState;
}

/* ── leaderboard ──────────────────────────────────────────────────────────── */

/**
 * One row. Note what is NOT here: any user identifier.
 *
 * `isYou` is decided on the server against the verified caller and crosses the
 * wire as a boolean, so the client is never given the ids it would need to work
 * it out itself. A stable public identifier is a correlation key, and a
 * leaderboard is exactly where someone would collect them.
 */
export interface BoardEntry {
  rank: number;
  name: string;
  /** Streak length on the streak board; guess count on the daily board. */
  value: number;
  isYou: boolean;
}

export interface Board {
  top: BoardEntry[];
  /** The caller's standing when they are outside the top N. */
  you: { rank: number; value: number; name: string } | null;
  total: number;
}

export type BoardKind = 'streak' | 'daily';

export interface LeaderboardResponse extends Board {
  board: BoardKind;
  seed: number;
}

/* ── the round ────────────────────────────────────────────────────────────── */

/**
 * The answer, and everything that comes with it.
 *
 * Present ONLY once the round is over. It is the single path from the server to
 * the client for the day's exercise, which is what makes the daily unsolvable
 * from the browser.
 */
export interface RevealedAnswer {
  name: string;
  display: string;
  group: MuscleGroup;
  equipment: Equipment;
  difficulty: string;
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
  howTo: string[];
  videoId: string | null;
  videoQuery: string;
  challenge: string;
  /** No-equipment substitute. Null for movements that need none. */
  homeVersion: { name: string; howTo: string } | null;
}

export type RoundStatus = 'playing' | 'won' | 'lost';

export interface Hints {
  category: MuscleGroup | null;
  equipment: Equipment | null;
  nextHintIn: number | null;
}

export interface MuscleFeedback {
  shared: MuscleRegion[];
  missed: MuscleRegion[];
}
