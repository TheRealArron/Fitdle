import 'server-only';
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
 * Freezing N makes appending SAFE: new words land at index 60+ and are simply
 * never scheduled, so you can add vocabulary any time without touching the
 * calendar. Bringing them into rotation is then a deliberate act - raise this
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
 */
export function answerFor(seed: number): Exercise {
  const name = ANSWER_ORDER[seed % SCHEDULE_SIZE];
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
 */
export function playGuesses(
  seed: number,
  guesses: string[],
  answer: Exercise,
  call?: string,
): GuessOutcome {
  const wordLength = answer.name.length;
  const evaluations = guesses.map((g) => evaluateGuess(g, answer.name));

  const won = guesses[guesses.length - 1] === answer.name;
  const lost = !won && guesses.length >= MAX_GUESSES;
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
