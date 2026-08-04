import type { Equipment, MuscleGroup, MuscleRegion } from './muscles';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLIENT CATALOGUE — deliberately public
 * ─────────────────────────────────────────────────────────────────────────────
 * Every exercise a player may type, with the data the UI needs to render the
 * exercise index, the muscle map and the guess history.
 *
 * This ships to the browser on purpose. Wordle works because every player
 * already carries the answer space in their head — common English. Nobody
 * carries a list of exercise names, so the game has to hand it over or it is
 * unplayable. `isAnswer` is public for the same reason: the shortlist panel
 * needs it, and knowing a word CAN be an answer tells you nothing about WHICH
 * day it lands on.
 *
 * What is NOT here, and must never be added:
 *
 *   - the date -> answer ordering  (server/answers.ts)
 *   - how-to text, video ids, the daily challenge  (server/answers.ts)
 *
 * Those are the leak. Everything else is a feature.
 *
 * ORDER CARRIES NO INFORMATION. Sorted by length then alphabetically, so the
 * array index cannot be reverse-engineered into a schedule.
 */

export interface Exercise {
  /** What the player types: letters only, uppercase. */
  name: string;
  /** Human spelling for the UI. */
  display: string;
  group: MuscleGroup;
  /** Prime movers — the muscles the exercise is *for*. */
  primary: MuscleRegion[];
  /** Assistors — worked meaningfully but not the point. */
  secondary: MuscleRegion[];
  equipment: Equipment;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  /** Eligible to be a daily answer. Which DAY remains server-side. */
  isAnswer: boolean;
}

export const CATALOGUE: Exercise[] = [
  { name: "CARRY", display: "Loaded Carry", group: "Full", primary: ["forearms", "traps"], secondary: ["abs", "obliques", "glutes"], equipment: "Dumbbell", difficulty: "Medium", isAnswer: false },
  { name: "CLEAN", display: "Power Clean", group: "Full", primary: ["traps", "glutes", "hamstrings"], secondary: ["quads", "forearms", "lowerBack", "shoulders"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "CRAWL", display: "Crawl", group: "Full", primary: ["shoulders", "abs"], secondary: ["quads", "triceps"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "CURLS", display: "Biceps Curl", group: "Arms", primary: ["biceps"], secondary: ["forearms"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: false },
  { name: "FLYES", display: "Chest Fly", group: "Chest", primary: ["chest"], secondary: ["shoulders", "biceps"], equipment: "Dumbbell", difficulty: "Medium", isAnswer: true },
  { name: "HINGE", display: "Hip Hinge", group: "Legs", primary: ["hamstrings", "glutes"], secondary: ["lowerBack", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "JERKS", display: "Push Jerk", group: "Shoulders", primary: ["shoulders", "triceps"], secondary: ["quads", "glutes", "abs"], equipment: "Barbell", difficulty: "Hard", isAnswer: false },
  { name: "LUNGE", display: "Lunge", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "MARCH", display: "High March", group: "Legs", primary: ["quads"], secondary: ["abs", "calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "PLANK", display: "Plank", group: "Core", primary: ["abs"], secondary: ["obliques", "shoulders", "glutes"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "PRESS", display: "Overhead Press", group: "Shoulders", primary: ["shoulders"], secondary: ["triceps", "abs", "traps"], equipment: "Barbell", difficulty: "Medium", isAnswer: true },
  { name: "PULSE", display: "Squat Pulse", group: "Legs", primary: ["quads"], secondary: ["glutes"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "RAISE", display: "Lateral Raise", group: "Shoulders", primary: ["shoulders"], secondary: ["traps"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: true },
  { name: "SHRUG", display: "Shrug", group: "Back", primary: ["traps"], secondary: ["forearms"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: true },
  { name: "SITUP", display: "Sit-Up", group: "Core", primary: ["abs"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "SPLIT", display: "Split Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "SQUAT", display: "Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs", "lowerBack"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "SWING", display: "Kettlebell Swing", group: "Full", primary: ["glutes", "hamstrings"], secondary: ["abs", "lowerBack", "forearms", "shoulders"], equipment: "Kettlebell", difficulty: "Medium", isAnswer: true },
  { name: "TWIST", display: "Russian Twist", group: "Core", primary: ["obliques"], secondary: ["abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "BRIDGE", display: "Glute Bridge", group: "Legs", primary: ["glutes"], secondary: ["hamstrings", "lowerBack", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "BURPEE", display: "Burpee", group: "Full", primary: ["quads", "chest", "shoulders"], secondary: ["abs", "triceps", "glutes"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "CHINUP", display: "Chin-Up", group: "Back", primary: ["lats", "biceps"], secondary: ["forearms", "abs"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "CRUNCH", display: "Crunch", group: "Core", primary: ["abs"], secondary: ["obliques"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "GOBLET", display: "Goblet Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["abs", "forearms"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: false },
  { name: "HOLLOW", display: "Hollow Body Hold", group: "Core", primary: ["abs"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "LUNGES", display: "Lunges", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "PISTOL", display: "Pistol Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs", "calves"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "PLANKS", display: "Planks", group: "Core", primary: ["abs"], secondary: ["obliques", "shoulders"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "PULLUP", display: "Pull-Up", group: "Back", primary: ["lats"], secondary: ["biceps", "forearms", "traps", "abs"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "PUSHUP", display: "Push-Up", group: "Chest", primary: ["chest", "triceps"], secondary: ["shoulders", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "ROWING", display: "Rowing Machine", group: "Full", primary: ["lats", "quads"], secondary: ["biceps", "lowerBack", "traps", "glutes"], equipment: "Machine", difficulty: "Medium", isAnswer: true },
  { name: "SHRUGS", display: "Shrugs", group: "Back", primary: ["traps"], secondary: ["forearms"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: false },
  { name: "SITUPS", display: "Sit-Ups", group: "Core", primary: ["abs"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "SKATER", display: "Skater Jump", group: "Legs", primary: ["glutes", "quads"], secondary: ["calves", "obliques"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "SNATCH", display: "Snatch", group: "Full", primary: ["traps", "shoulders", "glutes"], secondary: ["hamstrings", "quads", "lowerBack", "forearms"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "SPRINT", display: "Sprint", group: "Legs", primary: ["hamstrings", "quads", "glutes"], secondary: ["calves", "abs"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "SQUATS", display: "Squats", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "STEPUP", display: "Step-Up", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "TOETAP", display: "Toe Tap", group: "Core", primary: ["abs"], secondary: ["quads"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "VSITUP", display: "V-Sit Up", group: "Core", primary: ["abs"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "ARMCURL", display: "Biceps Curl", group: "Arms", primary: ["biceps"], secondary: ["forearms"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: true },
  { name: "BENTROW", display: "Bent-Over Row", group: "Back", primary: ["lats", "traps"], secondary: ["biceps", "lowerBack", "forearms"], equipment: "Barbell", difficulty: "Medium", isAnswer: true },
  { name: "BIRDDOG", display: "Bird Dog", group: "Core", primary: ["lowerBack", "abs"], secondary: ["glutes", "shoulders"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "BOXJUMP", display: "Box Jump", group: "Legs", primary: ["quads", "glutes"], secondary: ["calves", "hamstrings"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "BURPEES", display: "Burpees", group: "Full", primary: ["quads", "chest", "shoulders"], secondary: ["abs", "triceps", "glutes"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "CHINUPS", display: "Chin-Ups", group: "Back", primary: ["lats", "biceps"], secondary: ["forearms", "abs"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "CLIMBER", display: "Mountain Climber", group: "Full", primary: ["abs", "shoulders"], secondary: ["quads", "chest", "obliques"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "DEADBUG", display: "Dead Bug", group: "Core", primary: ["abs"], secondary: ["obliques", "lowerBack"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "FARMERS", display: "Farmer's Carry", group: "Full", primary: ["forearms", "traps"], secondary: ["abs", "obliques", "glutes"], equipment: "Dumbbell", difficulty: "Medium", isAnswer: true },
  { name: "JUMPING", display: "Jumping Jack", group: "Full", primary: ["calves", "shoulders"], secondary: ["quads", "glutes"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "KBSWING", display: "Kettlebell Swing", group: "Full", primary: ["glutes", "hamstrings"], secondary: ["abs", "lowerBack", "forearms"], equipment: "Kettlebell", difficulty: "Medium", isAnswer: false },
  { name: "LATPULL", display: "Lat Pulldown", group: "Back", primary: ["lats"], secondary: ["biceps", "traps", "forearms"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "LEGCURL", display: "Leg Curl", group: "Legs", primary: ["hamstrings"], secondary: ["calves"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "PISTOLS", display: "Pistol Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs", "calves"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "PLANKUP", display: "Plank Up-Down", group: "Core", primary: ["abs", "triceps"], secondary: ["shoulders", "chest"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "PULLUPS", display: "Pull-Ups", group: "Back", primary: ["lats"], secondary: ["biceps", "forearms", "traps"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "PUSHUPS", display: "Push-Ups", group: "Chest", primary: ["chest", "triceps"], secondary: ["shoulders", "abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "WALLSIT", display: "Wall Sit", group: "Legs", primary: ["quads"], secondary: ["glutes", "calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "CHESTFLY", display: "Cable Chest Fly", group: "Chest", primary: ["chest"], secondary: ["shoulders"], equipment: "Machine", difficulty: "Easy", isAnswer: false },
  { name: "CRABWALK", display: "Crab Walk", group: "Full", primary: ["triceps", "glutes"], secondary: ["shoulders", "abs", "hamstrings"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "CRUNCHES", display: "Crunches", group: "Core", primary: ["abs"], secondary: ["obliques"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "DEADLIFT", display: "Deadlift", group: "Legs", primary: ["hamstrings", "glutes", "lowerBack"], secondary: ["traps", "forearms", "lats", "quads"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "FACEPULL", display: "Face Pull", group: "Back", primary: ["traps", "shoulders"], secondary: ["lats", "biceps"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "FROGJUMP", display: "Frog Jump", group: "Legs", primary: ["quads", "glutes"], secondary: ["calves"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "HIPRAISE", display: "Hip Raise", group: "Legs", primary: ["glutes"], secondary: ["hamstrings", "lowerBack"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "INCHWORM", display: "Inchworm", group: "Full", primary: ["abs", "shoulders"], secondary: ["chest", "hamstrings", "triceps"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "KICKBACK", display: "Triceps Kickback", group: "Arms", primary: ["triceps"], secondary: ["shoulders"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: true },
  { name: "LATRAISE", display: "Lateral Raise", group: "Shoulders", primary: ["shoulders"], secondary: ["traps"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: false },
  { name: "LEGPRESS", display: "Leg Press", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "LEGRAISE", display: "Leg Raise", group: "Core", primary: ["abs"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "PULLOVER", display: "Dumbbell Pullover", group: "Back", primary: ["lats"], secondary: ["chest", "triceps", "abs"], equipment: "Dumbbell", difficulty: "Medium", isAnswer: true },
  { name: "PUSHDOWN", display: "Triceps Pushdown", group: "Arms", primary: ["triceps"], secondary: ["forearms"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "SIDEBEND", display: "Side Bend", group: "Core", primary: ["obliques"], secondary: ["abs", "lowerBack"], equipment: "Dumbbell", difficulty: "Easy", isAnswer: false },
  { name: "SIDEKICK", display: "Side Kick", group: "Legs", primary: ["glutes"], secondary: ["obliques", "quads"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "SIDESTEP", display: "Lateral Step", group: "Legs", primary: ["glutes", "quads"], secondary: ["calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "SKIPROPE", display: "Jump Rope", group: "Full", primary: ["calves"], secondary: ["quads", "shoulders", "forearms"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "SLEDPUSH", display: "Sled Push", group: "Full", primary: ["quads", "glutes"], secondary: ["calves", "chest", "shoulders"], equipment: "Machine", difficulty: "Hard", isAnswer: false },
  { name: "SUPERMAN", display: "Superman", group: "Back", primary: ["lowerBack"], secondary: ["glutes", "shoulders"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "THRUSTER", display: "Thruster", group: "Full", primary: ["quads", "shoulders"], secondary: ["glutes", "triceps", "abs"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "TOETOUCH", display: "Toe Touch", group: "Core", primary: ["abs"], secondary: ["obliques", "hamstrings"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "TUCKJUMP", display: "Tuck Jump", group: "Legs", primary: ["quads"], secondary: ["calves", "abs", "glutes"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
  { name: "ARMCIRCLE", display: "Arm Circle", group: "Shoulders", primary: ["shoulders"], secondary: ["traps"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "BACKSQUAT", display: "Back Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "lowerBack", "abs", "traps"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "BEARCRAWL", display: "Bear Crawl", group: "Full", primary: ["shoulders", "abs"], secondary: ["quads", "triceps", "obliques"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "BOXSTEPUP", display: "Box Step-Up", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "CALFRAISE", display: "Calf Raise", group: "Legs", primary: ["calves"], secondary: [], equipment: "Bodyweight", difficulty: "Easy", isAnswer: true },
  { name: "DEADLIFTS", display: "Deadlifts", group: "Legs", primary: ["hamstrings", "glutes", "lowerBack"], secondary: ["traps", "forearms", "lats"], equipment: "Barbell", difficulty: "Hard", isAnswer: false },
  { name: "HANDSTAND", display: "Handstand Hold", group: "Shoulders", primary: ["shoulders"], secondary: ["triceps", "abs", "forearms"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: true },
  { name: "HANGCLEAN", display: "Hang Clean", group: "Full", primary: ["traps", "glutes", "hamstrings"], secondary: ["quads", "forearms", "shoulders"], equipment: "Barbell", difficulty: "Hard", isAnswer: true },
  { name: "HEELTOUCH", display: "Heel Touch", group: "Core", primary: ["obliques"], secondary: ["abs"], equipment: "Bodyweight", difficulty: "Easy", isAnswer: false },
  { name: "HIPBRIDGE", display: "Single-Leg Bridge", group: "Legs", primary: ["glutes"], secondary: ["hamstrings", "abs"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "HIPTHRUST", display: "Hip Thrust", group: "Legs", primary: ["glutes"], secondary: ["hamstrings", "quads", "abs"], equipment: "Barbell", difficulty: "Medium", isAnswer: true },
  { name: "JUMPSQUAT", display: "Jump Squat", group: "Legs", primary: ["quads", "glutes"], secondary: ["calves", "hamstrings", "abs"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "KNEERAISE", display: "Hanging Knee Raise", group: "Core", primary: ["abs"], secondary: ["obliques", "forearms", "quads"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "PUSHPRESS", display: "Push Press", group: "Shoulders", primary: ["shoulders", "triceps"], secondary: ["quads", "glutes", "abs", "traps"], equipment: "Barbell", difficulty: "Medium", isAnswer: true },
  { name: "SEATEDROW", display: "Seated Cable Row", group: "Back", primary: ["lats", "traps"], secondary: ["biceps", "forearms", "lowerBack"], equipment: "Machine", difficulty: "Easy", isAnswer: true },
  { name: "SIDELUNGE", display: "Side Lunge", group: "Legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "obliques"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: false },
  { name: "SIDEPLANK", display: "Side Plank", group: "Core", primary: ["obliques"], secondary: ["abs", "shoulders", "glutes"], equipment: "Bodyweight", difficulty: "Medium", isAnswer: true },
  { name: "SPLITJUMP", display: "Split Jump", group: "Legs", primary: ["quads", "glutes"], secondary: ["calves", "hamstrings"], equipment: "Bodyweight", difficulty: "Hard", isAnswer: false },
];

export const MAX_GUESSES = 6;
/** Guess number at which each hint unlocks. Mirrored server-side. */
export const CATEGORY_HINT_AT = 3;
export const EQUIPMENT_HINT_AT = 5;

const BY_NAME = new Map(CATALOGUE.map((e) => [e.name, e]));

const BY_LENGTH = new Map<number, Exercise[]>();
for (const e of CATALOGUE) {
  const bucket = BY_LENGTH.get(e.name.length) ?? [];
  bucket.push(e);
  BY_LENGTH.set(e.name.length, bucket);
}
for (const bucket of BY_LENGTH.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));

export function getExercise(name: string): Exercise | undefined {
  return BY_NAME.get(name.toUpperCase());
}

export function exercisesOfLength(length: number): Exercise[] {
  return BY_LENGTH.get(length) ?? [];
}

/** Answers of a given width — the shortlist pool. Order is alphabetical. */
export function answersOfLength(length: number): Exercise[] {
  return exercisesOfLength(length).filter((e) => e.isAnswer);
}

/** A guess must be a real exercise of the same length as the answer. */
export function isValidGuess(word: string, length: number): boolean {
  const e = BY_NAME.get(word.toUpperCase());
  return e !== undefined && e.name.length === length;
}

/** Every muscle an exercise touches, primary and secondary. */
export function musclesOf(e: Pick<Exercise, 'primary' | 'secondary'>): Set<MuscleRegion> {
  return new Set([...e.primary, ...e.secondary]);
}

export function searchVideoUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/** Thumbnail served straight from YouTube's CDN — no API key, no embed. */
export function videoThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}
