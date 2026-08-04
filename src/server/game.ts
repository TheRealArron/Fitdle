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
import { evaluateGuess, type LetterState } from '@/lib/evaluate';
import { ANSWER_ORDER, COACHING } from '@/server/answers';

/**
 * The authoritative game. Everything the client used to compute for itself.
 *
 * The client keeps the catalogue (it needs it to render), but it never learns
 * which entry is today's answer until this module tells it — and it only tells
 * it once the round is genuinely over.
 */

export function dailySeed(now: Date = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/**
 * The one line that used to be in the browser. `ANSWER_ORDER` is server-only,
 * so this mapping cannot be read out of the bundle.
 */
export function answerFor(seed: number): Exercise {
  const name = ANSWER_ORDER[seed % ANSWER_ORDER.length];
  const exercise = getExercise(name);
  if (!exercise) throw new Error(`answer ${name} is not in the catalogue`);
  return exercise;
}

export interface MuscleFeedback {
  shared: MuscleRegion[];
  missed: MuscleRegion[];
}

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

export type GameStatus = 'playing' | 'won' | 'lost';

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
}

export interface GuessOutcome {
  ok: true;
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  muscles: MuscleFeedback;
  status: GameStatus;
  hints: { category: string | null; equipment: string | null; nextHintIn: number | null };
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
export function playGuesses(seed: number, guesses: string[], answer: Exercise): GuessOutcome {
  const wordLength = answer.name.length;
  const evaluations = guesses.map((g) => evaluateGuess(g, answer.name));

  const won = guesses[guesses.length - 1] === answer.name;
  const lost = !won && guesses.length >= MAX_GUESSES;
  const status: GameStatus = won ? 'won' : lost ? 'lost' : 'playing';
  const over = status !== 'playing';

  const count = guesses.length;
  const categoryOut = over || count >= CATEGORY_HINT_AT - 1;
  const equipmentOut = over || count >= EQUIPMENT_HINT_AT - 1;

  const coaching = COACHING[answer.name];

  return {
    ok: true,
    wordLength,
    guesses,
    evaluations,
    muscles: muscleFeedback(guesses, answer),
    status,
    hints: {
      category: categoryOut ? answer.group : null,
      equipment: equipmentOut ? answer.equipment : null,
      nextHintIn: categoryOut
        ? equipmentOut
          ? null
          : EQUIPMENT_HINT_AT - 1 - count
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
