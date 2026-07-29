export type LetterState = 'correct' | 'present' | 'absent';

/**
 * Wordle scoring, two-pass so repeated letters behave.
 *
 * Pass 1 locks exact positions and consumes those letters from the target's
 * budget. Pass 2 hands out `present` only while budget remains. Without this,
 * guessing STEPS against SQUAT would light up both S's even though the answer
 * holds one.
 */
export function evaluateGuess(guess: string, target: string): LetterState[] {
  const g = guess.toUpperCase();
  const t = target.toUpperCase();
  const result: LetterState[] = new Array(g.length).fill('absent');

  const remaining = new Map<string, number>();
  for (let i = 0; i < t.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'correct';
    } else {
      remaining.set(t[i], (remaining.get(t[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      remaining.set(g[i], left - 1);
    }
  }

  return result;
}

const RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/** Keyboard colouring: a letter keeps the best state it has ever earned. */
export function buildKeyStates(
  guesses: string[],
  evaluations: LetterState[][],
): Record<string, LetterState> {
  const keys: Record<string, LetterState> = {};
  guesses.forEach((guess, row) => {
    const evaluation = evaluations[row];
    if (!evaluation) return;
    guess.split('').forEach((char, i) => {
      const next = evaluation[i];
      const current = keys[char];
      if (current === undefined || RANK[next] > RANK[current]) {
        keys[char] = next;
      }
    });
  });
  return keys;
}

const EMOJI: Record<LetterState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
};

export function evaluationToEmoji(evaluation: LetterState[]): string {
  return evaluation.map((s) => EMOJI[s]).join('');
}
