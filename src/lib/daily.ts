import { ANSWERS, type Answer } from '@/data/exercises';
import { trustedNow } from '@/lib/trustedTime';

/**
 * Deterministic daily word.
 *
 * The seed arithmetic is byte-for-byte the specification's:
 *
 *     year * 10000 + (month + 1) * 100 + date      // => YYYYMMDD
 *     index = seed % ANSWERS.length
 *
 * The one deliberate deviation: the spec read *local* date parts, which means
 * a player in Auckland and a player in Los Angeles are on different puzzles for
 * ~21 hours out of every 24. The requirement is that every user gets the same
 * word today, so the date parts are read in UTC. Everything downstream — the
 * modulus, the answer order, the resulting answer — is unchanged.
 *
 * The answer pool is `ANSWERS` (see data/exercises.ts), which replaced the
 * spec's 5-letter `DICTIONARY`. Its order is protocol for the same reason the
 * dictionary's was.
 *
 * Consequence worth knowing: YYYYMMDD is not contiguous (20260131 -> 20260201
 * jumps by 70), so the answer index hops at month boundaries rather than
 * advancing by one. That is the specified behaviour and is preserved.
 */
export function getDailySeed(date: Date = trustedNow()): number {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

export function getDailyIndex(date: Date = trustedNow()): number {
  return getDailySeed(date) % ANSWERS.length;
}

export function getDailyExercise(date: Date = trustedNow()): Answer {
  return ANSWERS[getDailyIndex(date)];
}

/** Grid width for a given day. Varies 5–9 and is itself a clue. */
export function getDailyWordLength(date: Date = trustedNow()): number {
  return getDailyExercise(date).name.length;
}

/** `20260730` -> `2026-07-30`. Display only. */
export function formatSeed(seed: number): string {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100);
  const d = seed % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** UTC midnight of the day a seed refers to. */
export function seedToUtcDate(seed: number): Date {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100);
  const d = seed % 100;
  return new Date(Date.UTC(y, m - 1, d));
}

const MS_PER_DAY = 86_400_000;

/** Whole UTC days between two seeds. Negative if `b` precedes `a`. */
export function daysBetweenSeeds(a: number, b: number): number {
  return Math.round((seedToUtcDate(b).getTime() - seedToUtcDate(a).getTime()) / MS_PER_DAY);
}

/** Puzzle number, counting from the launch date. Used in share text. */
const LAUNCH_SEED = 20260101;
export function getPuzzleNumber(seed: number): number {
  return daysBetweenSeeds(LAUNCH_SEED, seed) + 1;
}

/** Milliseconds until the next UTC midnight, for the countdown timer. */
export function msUntilNextPuzzle(now: Date = trustedNow()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(0, next - now.getTime());
}
