import { CATALOGUE, musclesOf, type Exercise } from '@/data/exercises';
import { GROUP_OF_REGION, MUSCLE_LABEL, type MuscleRegion } from '@/data/muscles';

/**
 * Anatomy drill: a 30-second blitz on "what does this exercise work?".
 *
 * This is the warm-up, and it is deliberately NOT a brain-training game. The
 * evidence that generic cognitive-training tasks transfer to anything outside
 * themselves is weak, and claiming otherwise in a fitness product would be a
 * health claim we cannot support. This trains one specific, verifiable thing:
 * the exercise-to-muscle mapping the main game scores you on. Getting better at
 * it makes you measurably better at Fitdle, which is a claim we can stand behind.
 *
 * Entirely client-side. It reads only the public catalogue, holds no streak,
 * and touches no puzzle state.
 */

export const DRILL_SECONDS = 30;

/**
 * Kept for the option-list fallback, which exists for keyboard and screen-reader
 * users. Pointing at a muscle is the primary interaction; a labelled list is how
 * you do the same thing without a pointer.
 */
export const OPTION_COUNT = 3;

export interface DrillQuestion {
  exercise: Exercise;
  /** Three regions: exactly one worked by the exercise, two not. */
  options: MuscleRegion[];
  answer: MuscleRegion;
}

/**
 * Deterministic PRNG so a seeded run is reproducible in tests.
 * Not security-relevant; nothing here is worth cheating at.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ALL_REGIONS = Object.keys(MUSCLE_LABEL) as MuscleRegion[];

/**
 * Builds one question.
 *
 * The correct option is a PRIMARY mover. The distractors are regions the
 * exercise does not work *at all* - not even as a secondary assistor - because
 * a distractor the exercise genuinely trains makes the "wrong" answer arguably
 * right, and a quiz you can lose by being correct teaches nothing.
 *
 * Distractors are also drawn from a different muscle group where possible: two
 * options from the same group as the answer make the question a coin flip on
 * wording rather than a test of anatomy.
 */
export function makeQuestion(rand: () => number, exercise?: Exercise): DrillQuestion {
  const ex = exercise ?? pick(CATALOGUE, rand);
  const worked = musclesOf(ex);

  const answer = pick(ex.primary, rand);
  const answerGroup = GROUP_OF_REGION[answer];

  const clean = ALL_REGIONS.filter((r) => !worked.has(r));
  const faraway = clean.filter((r) => GROUP_OF_REGION[r] !== answerGroup);

  // Prefer distractors from other groups; fall back to any unworked region for
  // the handful of full-body movements that leave little else untouched.
  const pool = faraway.length >= OPTION_COUNT - 1 ? faraway : clean;
  const distractors = shuffle(pool, rand).slice(0, OPTION_COUNT - 1);

  return { exercise: ex, answer, options: shuffle([answer, ...distractors], rand) };
}

/** A run of questions. Exercises do not repeat while the catalogue allows it. */
export function makeRound(seed: number, count = 40): DrillQuestion[] {
  const rand = mulberry32(seed);
  const order = shuffle([...CATALOGUE], rand).slice(0, count);
  return order.map((e) => makeQuestion(rand, e));
}

/**
 * The badge a score earns, shown on the share string.
 *
 * Thresholds are deliberately reachable: the drill exists to teach the
 * catalogue, and a reward nobody gets teaches nobody anything.
 */
export const DRILL_BADGES: ReadonlyArray<{ at: number; emoji: string; label: string }> = [
  { at: 20, emoji: '🧠', label: 'Anatomist' },
  { at: 14, emoji: '💪', label: 'Sharp' },
  { at: 8, emoji: '🔥', label: 'Warmed up' },
];

export function badgeFor(score: number): { emoji: string; label: string } | null {
  return DRILL_BADGES.find((b) => score >= b.at) ?? null;
}
