import { getExercise, musclesOf } from '@/data/exercises';
import type { MuscleRegion } from '@/data/muscles';

export interface MuscleFeedback {
  /** Worked by one of your guesses AND by the answer. Lights green. */
  shared: Set<MuscleRegion>;
  /** Worked by one of your guesses but NOT by the answer. Lights dim red. */
  missed: Set<MuscleRegion>;
}

/**
 * The second deduction channel.
 *
 * Crucially this only ever reports on muscles you have *probed*. The answer's
 * untouched muscles stay dark, so the figure narrows the search space without
 * handing over the category — that is what the guess-3 hint is for.
 *
 * A region is `shared` if any guess so far shares it with the answer, and
 * `missed` only if it has been hit by a guess and is not in the answer. The two
 * sets are therefore disjoint by construction.
 */
export function accumulateMuscleFeedback(
  guesses: string[],
  // Structural, not nominal: the daily target arrives from the API as a plain
  // reveal payload, not a catalogue Exercise, and only the muscles matter here.
  target: { primary: MuscleRegion[]; secondary: MuscleRegion[] },
): MuscleFeedback {
  const targetMuscles = musclesOf(target);
  const shared = new Set<MuscleRegion>();
  const missed = new Set<MuscleRegion>();

  for (const name of guesses) {
    const guessed = getExercise(name);
    if (!guessed) continue;
    for (const region of musclesOf(guessed)) {
      if (targetMuscles.has(region)) shared.add(region);
      else missed.add(region);
    }
  }

  return { shared, missed };
}

/** How much of the answer's muscle map you have uncovered, 0–1. */
export function discoveryRatio(
  shared: ReadonlySet<MuscleRegion>,
  target: { primary: MuscleRegion[]; secondary: MuscleRegion[] },
): number {
  const total = musclesOf(target).size;
  return total === 0 ? 0 : shared.size / total;
}
