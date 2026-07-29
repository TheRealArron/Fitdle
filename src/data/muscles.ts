/**
 * The anatomy vocabulary the whole game is built on.
 *
 * Two levels of granularity, deliberately:
 *
 *   MuscleRegion — the 14 areas the body figure can light up. This is the
 *                  feedback channel: fine enough that SQUAT and DEADLIFT give
 *                  visibly different answers.
 *   MuscleGroup  — the 7 coarse buckets. This is the category hint revealed at
 *                  guess 3, and it is what a player can actually reason about
 *                  ("it's a back exercise") without an anatomy degree.
 */

export type MuscleRegion =
  | 'chest'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lowerBack'
  | 'lats'
  | 'traps'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

/**
 * `Shoulders` is an addition to the specification's six groups. Folding delts
 * into `Arms` mislabels roughly a dozen exercises, and the category hint is
 * only useful if it is accurate.
 */
export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Core' | 'Legs' | 'Full';

export type Equipment = 'Bodyweight' | 'Barbell' | 'Dumbbell' | 'Machine' | 'Kettlebell';

export const MUSCLE_LABEL: Record<MuscleRegion, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lowerBack: 'Lower back',
  lats: 'Lats',
  traps: 'Traps',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export const GROUP_OF_REGION: Record<MuscleRegion, MuscleGroup> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  abs: 'Core',
  obliques: 'Core',
  lowerBack: 'Back',
  lats: 'Back',
  traps: 'Back',
  glutes: 'Legs',
  quads: 'Legs',
  hamstrings: 'Legs',
  calves: 'Legs',
};

/** Regions belonging to a coarse group — drives the category outline. */
export const REGIONS_IN_GROUP: Record<MuscleGroup, MuscleRegion[]> = {
  Chest: ['chest'],
  Back: ['lats', 'traps', 'lowerBack'],
  Shoulders: ['shoulders'],
  Arms: ['biceps', 'triceps', 'forearms'],
  Core: ['abs', 'obliques'],
  Legs: ['glutes', 'quads', 'hamstrings', 'calves'],
  // A full-body movement has no single silhouette to outline, so the hint
  // renders as a label instead.
  Full: [],
};

export const GROUP_ORDER: MuscleGroup[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Core',
  'Legs',
  'Full',
];
