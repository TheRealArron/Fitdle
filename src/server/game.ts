import 'server-only';
import { createHmac } from 'node:crypto';
import {
  CATEGORY_HINT_AT,
  EQUIPMENT_HINT_AT,
  MAX_GUESSES,
  getExercise,
  isValidGuess,
  musclesOf,
  type Exercise,
} from '@/data/exercises';
import type { MuscleRegion } from '@/data/muscles';
import type { MuscleFeedback, RoundStatus } from '@/lib/contracts';
import { evaluateGuess, type LetterState } from '@/lib/evaluate';
import { ANSWER_ORDER, COACHING } from '@/server/answers';
import { count, secondsUntilUtcMidnight } from '@/server/counter';

/**
 * The authoritative game. Everything the client used to compute for itself.
 *
 * The client keeps the catalogue (it needs it to render), but it never learns
 * which entry is today's answer until this module tells it - and it only tells
 * it once the round is genuinely over.
 */

export function dailySeed(now: Date = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/**
 * How many entries of ANSWER_ORDER the calendar actually cycles through.
 *
 * ─ Why this is a frozen constant and not `ANSWER_ORDER.length` ──────────────
 *
 * The daily answer is `ANSWER_ORDER[seed % N]`. If N is the array length, then
 * appending a single word changes N, which changes the remainder for EVERY
 * date - measured: 365 of 365 days over a year, including today's.
 *
 * That is not a gradual rollout. Mid-round players hold a session signed
 * against a seed whose answer just changed underneath them, their board stops
 * matching their feedback, and every share grid already posted becomes wrong.
 *
 * Freezing N makes appending SAFE: new words land at index 62 and beyond and are
 * simply never scheduled, so you can add vocabulary any time without touching
 * the calendar. Bringing them into rotation is then a deliberate act - raise this
 * number - rather than a side effect of editing a list.
 *
 * Raising it still reshuffles every future date. Do it before launch, or accept
 * the reshuffle knowingly. `tests/daily.test.ts` pins specific date→answer
 * pairs so any change fails loudly rather than silently.
 *
 * ─ Why 62, and why "bigger" is the wrong instinct ───────────────────────────
 *
 * The seed is YYYYMMDD, which is NOT contiguous - it jumps by ~70 at every
 * month boundary (20260131 -> 20260201). So N interacts with that jump, and the
 * good values are irregular rather than monotonic. Swept over two years:
 *
 *     N    first repeat   tightest gap   slots used
 *    60           51d            11d       60/60     (was)
 *    62           55d            45d       62/62     (now)
 *    70            1d             1d       70/70     <- same answer two days
 *                                                       running: 70 IS the jump
 *    99           30d            27d       41/99     <- 58% never scheduled
 *
 * 62 gives the largest worst-case gap between repeats with every slot in use,
 * for the cost of two extra words. N=70 through 78 are all landmines, and the
 * naive "use the whole catalogue" would leave most of it unscheduled.
 *
 * `tests/daily.test.ts` pins the tightest gap, so a future change to this
 * number fails with the reason attached rather than quietly degrading.
 */
export const SCHEDULE_SIZE = 62;

/**
 * The one line that used to be in the browser. `ANSWER_ORDER` is server-only,
 * so this mapping cannot be read out of the bundle.
 *
 * ── Server-only is not secret when the repository is public ─────────────────
 * Keeping `ANSWER_ORDER` out of the bundle meant nothing once the source was on
 * a public GitHub repository: `answers.ts` plus `seed % 62` IS every future
 * answer, readable without opening the app at all.
 *
 * So with `FITDLE_SCHEDULE_SECRET` set, the slot a date lands on is mapped
 * through a permutation derived from that secret, which lives only in the
 * deployment's environment. The permutation:
 *
 *   - only swaps words of the SAME length (slots k, k+5, k+10, ... all hold
 *     5+k letters), so the daily width rotation is exactly what it was;
 *   - is fixed rather than reshuffled per cycle, so each date keeps its slot
 *     and the 45-day minimum gap between repeats is exactly what it was. A
 *     per-cycle reshuffle could put the same word on two adjacent days.
 *
 * What it does not do: anyone who records every reveal for a full cycle can
 * rebuild the table, exactly as before. It turns "read it on GitHub" back into
 * "watch for two months".
 *
 * `FITDLE_SCHEDULE_FROM` (a YYYYMMDD seed) is required alongside it, and dates
 * before it keep the old mapping, so switching it on never changes the answer
 * of a round somebody is already playing. Set it to tomorrow.
 */
function scheduledSlot(seed: number): number {
  const slot = seed % SCHEDULE_SIZE;
  const secret = process.env.FITDLE_SCHEDULE_SECRET?.trim();
  if (!secret) return slot;

  if (secret.length < 32) {
    throw new Error('FITDLE_SCHEDULE_SECRET is too short (need 32+ chars).');
  }
  const from = Number(process.env.FITDLE_SCHEDULE_FROM?.trim());
  if (!Number.isInteger(from) || from < 20000101 || from > 99991231) {
    throw new Error(
      'FITDLE_SCHEDULE_SECRET is set but FITDLE_SCHEDULE_FROM is not a YYYYMMDD date. ' +
        'Set it to tomorrow so no round in progress changes answer.',
    );
  }
  if (seed < from) return slot;

  return keyedPermutation(secret)[slot];
}

let cachedPermutation: { secret: string; perm: number[] } | null = null;

function keyedPermutation(secret: string): number[] {
  if (cachedPermutation?.secret === secret) return cachedPermutation.perm;

  const perm = Array.from({ length: SCHEDULE_SIZE }, (_, i) => i);
  for (let k = 0; k < 5; k++) {
    const positions: number[] = [];
    for (let i = k; i < SCHEDULE_SIZE; i += 5) positions.push(i);

    // Fisher-Yates, each draw from an HMAC of the secret. Modulo bias over a
    // 32-bit draw into at most 13 buckets is below one part in 300 million.
    const shuffled = [...positions];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const mac = createHmac('sha256', secret).update(`fitdle-schedule:${k}:${j}`).digest();
      const r = mac.readUInt32BE(0) % (j + 1);
      [shuffled[j], shuffled[r]] = [shuffled[r], shuffled[j]];
    }
    positions.forEach((p, i) => (perm[p] = shuffled[i]));
  }

  cachedPermutation = { secret, perm };
  return perm;
}

export function answerFor(seed: number): Exercise {
  const name = ANSWER_ORDER[scheduledSlot(seed)];
  const exercise = getExercise(name);
  if (!exercise) throw new Error(`answer ${name} is not in the catalogue`);
  return exercise;
}

export type { MuscleFeedback };

/** Overlap between everything guessed so far and the answer. */
function muscleFeedback(guesses: string[], answer: Exercise): MuscleFeedback {
  const target = musclesOf(answer);
  const shared = new Set<MuscleRegion>();
  const missed = new Set<MuscleRegion>();

  for (const name of guesses) {
    const g = getExercise(name);
    if (!g) continue;
    for (const m of musclesOf(g)) (target.has(m) ? shared : missed).add(m);
  }
  return { shared: [...shared], missed: [...missed] };
}

/** Same three states the client save uses; declared once in contracts. */
export type GameStatus = RoundStatus;

export interface Reveal {
  name: string;
  display: string;
  group: string;
  equipment: string;
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

export interface GuessOutcome {
  ok: true;
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  muscles: MuscleFeedback;
  status: GameStatus;
  hints: { category: string | null; equipment: string | null; nextHintIn: number | null };
  /** The opening call and how it went. Null when no call was made. */
  call: { group: string; correct: boolean } | null;
  /** Present only once the round is over. This is the only path to the answer. */
  reveal: Reveal | null;
}

export interface GuessRejection {
  ok: false;
  reason: 'length' | 'unknown' | 'duplicate' | 'finished';
  message: string;
}

/**
 * Scores a full guess history against the day's answer.
 *
 * Deliberately recomputes from the whole history rather than accepting an
 * incremental update: the client sends a signed list of guesses and gets back
 * the complete truth, so there is no partial state on either side to disagree
 * about, and no way to inject a single fabricated result into a real game.
 *
 * `spent` lets a caller say the day has cost more than this token admits. See
 * the comment on `lost` below.
 */
export function playGuesses(
  seed: number,
  guesses: string[],
  answer: Exercise,
  call?: string,
  spent = guesses.length,
): GuessOutcome {
  const wordLength = answer.name.length;
  const evaluations = guesses.map((g) => evaluateGuess(g, answer.name));

  const won = guesses[guesses.length - 1] === answer.name;

  /*
   * `spent` is how many guesses the puzzle has actually cost this player today,
   * which is not always how many are in the token they sent.
   *
   * The session is the server's only memory of a round and the client decides
   * whether to send it, so discarding it hands out a fresh board for the same
   * day. Measured before this existed: burn five guesses, discard the token,
   * and you are playing the day again from zero - so a player who was about to
   * lose simply never submitted the sixth, and a streak could never break.
   *
   * The server counts per account, so for a signed-in player the day ends when
   * six have been spent however they were spread across sessions. `spent`
   * defaults to `guesses.length`, which is exactly the old behaviour for every
   * caller that does not know better - anonymous play included, deliberately:
   * there is no identity to count against and their save is their own file.
   */
  const lost = !won && Math.max(guesses.length, spent) >= MAX_GUESSES;
  const status: GameStatus = won ? 'won' : lost ? 'lost' : 'playing';
  const over = status !== 'playing';

  const count = guesses.length;

  /*
   * The opening call is a bet on fitness knowledge rather than letter entropy.
   *
   *   right -> the equipment hint lands immediately, which is a real edge no
   *            amount of solver maths would have given you.
   *   wrong -> you forfeit the guess-3 category hint. You were confident and
   *            you were wrong, so the safety net goes.
   *   none  -> the ordinary game, unchanged.
   *
   * This is the only mechanic in the game a solver cannot play, which is the
   * whole point of adding it.
   */
  const called = call !== undefined;
  const calledRight = called && call === answer.group;

  const categoryOut = over || (called && !calledRight ? false : count >= CATEGORY_HINT_AT - 1);
  const equipmentOut = over || calledRight || count >= EQUIPMENT_HINT_AT - 1;

  const coaching = COACHING[answer.name];

  return {
    ok: true,
    wordLength,
    guesses,
    evaluations,
    muscles: muscleFeedback(guesses, answer),
    status,
    call: called ? { group: call!, correct: calledRight } : null,
    hints: {
      category: categoryOut ? answer.group : null,
      equipment: equipmentOut ? answer.equipment : null,
      nextHintIn: categoryOut
        ? equipmentOut
          ? null
          : EQUIPMENT_HINT_AT - 1 - count
        : called && !calledRight
          // Forfeited. There is no next category hint to count down to.
          ? null
          : CATEGORY_HINT_AT - 1 - count,
    },
    reveal: over
      ? {
          name: answer.name,
          display: answer.display,
          group: answer.group,
          equipment: answer.equipment,
          difficulty: answer.difficulty,
          primary: answer.primary,
          secondary: answer.secondary,
          howTo: coaching?.howTo ?? [],
          videoId: coaching?.videoId ?? null,
          videoQuery: coaching?.videoQuery ?? answer.display,
          challenge: coaching?.challenge ?? '',
          homeVersion: coaching?.homeVersion ?? null,
        }
      : null,
  };
}

/**
 * How many guesses today has already cost this player.
 *
 * Signed-in only. There is no identity to count an anonymous player against -
 * an address is shared by everyone behind one NAT, and charging a stranger's
 * guesses to you would be worse than the hole it closes - so they keep the
 * old behaviour, which is safe because nothing but their own browser reads
 * their save.
 *
 * A peek, never a claim: `/api/guess` is the only place a guess is counted,
 * and counting one here would charge a player for opening the page.
 */
export async function guessesSpent(userId: string | null, seed: number): Promise<number> {
  if (!userId) return 0;
  const seen = await count(
    `spent:${seed}:${userId}`,
    MAX_GUESSES,
    seed,
    secondsUntilUtcMidnight(),
    false,
  );
  return Math.min(seen.count, MAX_GUESSES);
}

/** Validates one new guess against the existing history. */
export function validateGuess(
  guess: string,
  existing: string[],
  wordLength: number,
  status: GameStatus,
): GuessRejection | null {
  if (status !== 'playing') {
    return { ok: false, reason: 'finished', message: 'This puzzle is already finished.' };
  }
  if (guess.length !== wordLength) {
    return { ok: false, reason: 'length', message: `Needs ${wordLength} letters` };
  }
  if (!isValidGuess(guess, wordLength)) {
    return { ok: false, reason: 'unknown', message: 'Not an exercise in the list' };
  }
  if (existing.includes(guess)) {
    return { ok: false, reason: 'duplicate', message: 'Already guessed' };
  }
  return null;
}
