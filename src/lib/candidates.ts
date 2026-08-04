import { answersOfLength as poolOfLength, type Exercise } from '@/data/exercises';
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
 * Drawn from the answer-eligible subset, not the whole catalogue — guess-only
 * entries can never be the answer, so listing them would be misleading.
 *
 * `isAnswer` is public while the date->answer mapping is not. Knowing a word CAN
 * be an answer narrows the field from 99 to 60; knowing WHICH DAY it lands on
 * would give the game away, and that stays on the server.
 */
export function possibleAnswers(
  guesses: string[],
  evaluations: LetterState[][],
  length: number,
): Exercise[] {
  return poolOfLength(length).filter((a) => {
    return guesses.every((guess, i) => {
      const expected = evaluations[i];
      if (!expected) return true;
      const actual = evaluateGuess(guess, a.name);
      return actual.every((s, j) => s === expected[j]);
    });
  });
}

/** Every answer of today's width, ignoring the clues. */
export function answersOfLength(length: number): Exercise[] {
  return poolOfLength(length);
}
