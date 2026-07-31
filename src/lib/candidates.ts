import { ANSWERS, type Answer } from '@/data/exercises';
import { evaluateGuess, type LetterState } from '@/lib/evaluate';

/**
 * Which answers are still possible given everything the board has told you.
 *
 * The test is exact rather than heuristic: a candidate survives only if
 * scoring each of your guesses against it would have produced precisely the
 * feedback you actually got. That handles duplicate letters and yellow/grey
 * interactions for free, because it reuses the real scoring function instead of
 * trying to re-derive its rules.
 *
 * Drawn from ANSWERS, not the whole catalogue — guess-only entries can never be
 * the answer, so listing them as candidates would be misleading.
 */
export function possibleAnswers(
  guesses: string[],
  evaluations: LetterState[][],
  length: number,
): Answer[] {
  return ANSWERS.filter((a) => {
    if (a.name.length !== length) return false;
    return guesses.every((guess, i) => {
      const expected = evaluations[i];
      if (!expected) return true;
      const actual = evaluateGuess(guess, a.name);
      return actual.every((s, j) => s === expected[j]);
    });
  });
}

/** Every answer of today's width, ignoring the clues. */
export function answersOfLength(length: number): Answer[] {
  return ANSWERS.filter((a) => a.name.length === length);
}
