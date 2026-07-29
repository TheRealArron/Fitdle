import type { Equipment, MuscleGroup, MuscleRegion } from './muscles';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACED THE SPECIFICATION'S 5-LETTER DICTIONARY
 * ─────────────────────────────────────────────────────────────────────────────
 * English contains roughly eight real five-letter exercise names. The spec
 * needed fifteen, so it padded the list with mutilations — BURPE, ROWSR, DIPSB,
 * VUPPS, CRUNC. Those are unguessable: no player can deduce a word that is not
 * a word. Curating the list cannot fix it while the grid is five wide, so the
 * fixed length went instead.
 *
 * Answers now run 5–9 letters at their natural spelling, and the grid width
 * changes daily — itself a strong clue.
 *
 * NAMING RULE (stated to the player in the help modal): letters only, no
 * spaces, no hyphens, singular. Pull-ups -> PULLUP. Farmer's carry -> FARMERS.
 *
 * ANSWERS ORDER IS PROTOCOL. The daily answer is `ANSWERS[seed % ANSWERS.length]`.
 * Reordering or inserting rewrites every past and future puzzle. The order
 * cycles 5,6,7,8,9 letters so consecutive days differ in grid width. A test
 * pins both the order and the cycle.
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
}

/** An exercise eligible to be the daily answer. Coaching content is required. */
export interface Answer extends Exercise {
  howTo: string[];
  videoQuery: string;
}

export const ANSWERS: Answer[] = [
  /* ── cycle 1 ── */
  {
    name: 'SQUAT',
    display: 'Squat',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'abs', 'lowerBack'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Feet shoulder-width, toes turned out 15–30 degrees.',
      'Break at the hips and knees together, chest tall, weight on mid-foot.',
      'Descend until the hip crease passes the knee, then stand without letting the knees cave.',
    ],
    videoQuery: 'bodyweight squat proper form',
  },
  {
    name: 'BURPEE',
    display: 'Burpee',
    group: 'Full',
    primary: ['quads', 'chest', 'shoulders'],
    secondary: ['abs', 'triceps', 'glutes'],
    equipment: 'Bodyweight',
    difficulty: 'Hard',
    howTo: [
      'Squat down, plant both hands shoulder-width, and shoot the feet back to a rigid plank.',
      'Optional chest-to-floor push-up, then snap the feet back under your hips.',
      'Explode into a vertical jump and land softly on bent knees.',
    ],
    videoQuery: 'burpee proper form',
  },
  {
    name: 'CLIMBER',
    display: 'Mountain Climber',
    group: 'Full',
    primary: ['abs', 'shoulders'],
    secondary: ['quads', 'chest', 'obliques'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'Start in a high plank with hands under the shoulders and hips level.',
      'Drive one knee toward your chest without letting the hips pike up.',
      'Alternate legs quickly, keeping the shoulders stacked over the wrists.',
    ],
    videoQuery: 'mountain climber exercise proper form',
  },
  {
    name: 'DEADLIFT',
    display: 'Deadlift',
    group: 'Legs',
    primary: ['hamstrings', 'glutes', 'lowerBack'],
    secondary: ['traps', 'forearms', 'lats', 'quads'],
    equipment: 'Barbell',
    difficulty: 'Hard',
    howTo: [
      'Bar over mid-foot, shins an inch away, grip just outside the knees.',
      'Set a flat back and pull the slack out of the bar before it moves.',
      'Push the floor away — hips and shoulders rise together. Lock out with glutes, not by leaning back.',
    ],
    videoQuery: 'conventional deadlift proper form',
  },
  {
    name: 'HIPTHRUST',
    display: 'Hip Thrust',
    group: 'Legs',
    primary: ['glutes'],
    secondary: ['hamstrings', 'quads', 'abs'],
    equipment: 'Barbell',
    difficulty: 'Medium',
    howTo: [
      'Upper back on a bench, feet flat and shin vertical at the top.',
      'Tuck the ribs down and drive through the heels until hips are level with knees.',
      'Squeeze the glutes hard for a second — do not arch the lower back to get higher.',
    ],
    videoQuery: 'barbell hip thrust proper form',
  },

  /* ── cycle 2 ── */
  {
    name: 'PLANK',
    display: 'Plank',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques', 'shoulders', 'glutes'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Forearms under the shoulders, elbows at 90 degrees.',
      'Squeeze the glutes and brace the ribs down so the spine stays neutral.',
      'Hold a straight line from ear to heel — no sagging hips, no piking. Quality beats duration.',
    ],
    videoQuery: 'plank exercise proper form',
  },
  {
    name: 'CRUNCH',
    display: 'Crunch',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Lie back, knees bent, feet flat, hands light at the temples.',
      'Curl the ribcage toward the pelvis — this is a short range of motion.',
      'Leave a fist of space under the chin; never pull on the neck.',
    ],
    videoQuery: 'abdominal crunch proper form',
  },
  {
    name: 'BOXJUMP',
    display: 'Box Jump',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['calves', 'hamstrings'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'Stand a foot from the box, dip to a quarter squat and swing the arms back.',
      'Jump and land softly in a quarter squat with the whole foot on the box.',
      'Step down, never jump down — that is where Achilles injuries come from.',
    ],
    videoQuery: 'box jump proper form',
  },
  {
    name: 'PULLOVER',
    display: 'Dumbbell Pullover',
    group: 'Back',
    primary: ['lats'],
    secondary: ['chest', 'triceps', 'abs'],
    equipment: 'Dumbbell',
    difficulty: 'Medium',
    howTo: [
      'Lie across or along a bench, holding one dumbbell over the chest with both hands.',
      'Keep a soft elbow bend and lower the weight back over your head until you feel the lats stretch.',
      'Pull it back over the chest with the lats, keeping the ribs down throughout.',
    ],
    videoQuery: 'dumbbell pullover proper form',
  },
  {
    name: 'BEARCRAWL',
    display: 'Bear Crawl',
    group: 'Full',
    primary: ['shoulders', 'abs'],
    secondary: ['quads', 'triceps', 'obliques'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'Hands under shoulders, knees under hips and hovering an inch off the floor.',
      'Move the opposite hand and foot together, keeping the knees low.',
      'Hips stay level — if they rock side to side, shorten your steps.',
    ],
    videoQuery: 'bear crawl exercise proper form',
  },

  /* ── cycle 3 ── */
  {
    name: 'LUNGE',
    display: 'Lunge',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Step forward far enough that both knees can reach 90 degrees.',
      'Torso upright, front shin close to vertical.',
      'Lower until the back knee hovers just above the floor, then push through the front heel.',
    ],
    videoQuery: 'forward lunge proper form',
  },
  {
    name: 'PUSHUP',
    display: 'Push-Up',
    group: 'Chest',
    primary: ['chest', 'triceps'],
    secondary: ['shoulders', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Hands slightly wider than the shoulders, body in one rigid line.',
      'Lower until the chest is a fist from the floor, elbows at roughly 45 degrees.',
      'Press away and keep the glutes squeezed so the hips never sag.',
    ],
    videoQuery: 'push up proper form',
  },
  {
    name: 'DEADBUG',
    display: 'Dead Bug',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques', 'lowerBack'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'On your back, arms straight up, hips and knees at 90 degrees.',
      'Press the lower back into the floor and hold it there — that is the whole exercise.',
      'Slowly extend the opposite arm and leg, return, then switch. Stop when the back lifts.',
    ],
    videoQuery: 'dead bug core exercise proper form',
  },
  {
    name: 'KICKBACK',
    display: 'Triceps Kickback',
    group: 'Arms',
    primary: ['triceps'],
    secondary: ['shoulders'],
    equipment: 'Dumbbell',
    difficulty: 'Easy',
    howTo: [
      'Hinge forward to about 45 degrees with a flat back, upper arm pinned to your side.',
      'Straighten the elbow until the arm is parallel with the torso.',
      'Squeeze at lockout, then lower slowly. The upper arm must not move.',
    ],
    videoQuery: 'dumbbell triceps kickback proper form',
  },
  {
    name: 'CALFRAISE',
    display: 'Calf Raise',
    group: 'Legs',
    primary: ['calves'],
    secondary: [],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Stand with the balls of the feet on a step, heels hanging free.',
      'Drop the heels for a full stretch, then press up as high as the ankle allows.',
      'Pause at the top for a second. Speed here is wasted effort.',
    ],
    videoQuery: 'standing calf raise proper form',
  },

  /* ── cycle 4 ── */
  {
    name: 'PRESS',
    display: 'Overhead Press',
    group: 'Shoulders',
    primary: ['shoulders'],
    secondary: ['triceps', 'abs', 'traps'],
    equipment: 'Barbell',
    difficulty: 'Medium',
    howTo: [
      'Bar on the front delts, grip just outside the shoulders, elbows slightly ahead.',
      'Squeeze the glutes and abs so the ribs cannot flare.',
      'Press up and move the head back out of the way, finishing with the bar over mid-foot.',
    ],
    videoQuery: 'standing overhead press proper form',
  },
  {
    name: 'PULLUP',
    display: 'Pull-Up',
    group: 'Back',
    primary: ['lats'],
    secondary: ['biceps', 'forearms', 'traps', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Hard',
    howTo: [
      'Overhand grip just outside shoulder width, hanging from straight arms.',
      'Pull the shoulder blades down first, then drive the elbows toward the ribs.',
      'Chin clears the bar, then lower all the way to a dead hang. No kipping.',
    ],
    videoQuery: 'pull up proper form',
  },
  {
    name: 'WALLSIT',
    display: 'Wall Sit',
    group: 'Legs',
    primary: ['quads'],
    secondary: ['glutes', 'calves'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Back flat against a wall, walk the feet out until knees and hips are both at 90 degrees.',
      'Knees stack over the ankles, weight through the heels.',
      'Hold. Breathe normally — holding your breath makes it much harder than it needs to be.',
    ],
    videoQuery: 'wall sit exercise proper form',
  },
  {
    name: 'LEGPRESS',
    display: 'Leg Press',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves'],
    equipment: 'Machine',
    difficulty: 'Easy',
    howTo: [
      'Feet shoulder-width in the middle of the platform, whole foot in contact.',
      'Lower until the knees reach about 90 degrees — stop before the pelvis tucks.',
      'Press back without snapping the knees into a hard lockout.',
    ],
    videoQuery: 'leg press machine proper form',
  },
  {
    name: 'SEATEDROW',
    display: 'Seated Cable Row',
    group: 'Back',
    primary: ['lats', 'traps'],
    secondary: ['biceps', 'forearms', 'lowerBack'],
    equipment: 'Machine',
    difficulty: 'Easy',
    howTo: [
      'Chest tall, slight forward lean at the start, knees softly bent.',
      'Pull the handle to the navel by driving the elbows back past the ribs.',
      'Squeeze the shoulder blades together, then let the arms extend fully under control.',
    ],
    videoQuery: 'seated cable row proper form',
  },

  /* ── cycle 5 ── */
  {
    name: 'CLEAN',
    display: 'Power Clean',
    group: 'Full',
    primary: ['traps', 'glutes', 'hamstrings'],
    secondary: ['quads', 'forearms', 'lowerBack', 'shoulders'],
    equipment: 'Barbell',
    difficulty: 'Hard',
    howTo: [
      'Start like a deadlift: bar over mid-foot, flat back, arms straight.',
      'Push the floor away, then violently extend hips, knees and ankles.',
      'Pull under the bar and catch it on the front delts with the elbows whipping through fast.',
    ],
    videoQuery: 'power clean proper form',
  },
  {
    name: 'CHINUP',
    display: 'Chin-Up',
    group: 'Back',
    primary: ['lats', 'biceps'],
    secondary: ['forearms', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Hard',
    howTo: [
      'Underhand grip at about shoulder width, hanging from straight arms.',
      'Lead with the chest and drive the elbows down toward your pockets.',
      'The supinated grip gives the biceps more leverage — expect a few more reps than pull-ups.',
    ],
    videoQuery: 'chin up proper form',
  },
  {
    name: 'BIRDDOG',
    display: 'Bird Dog',
    group: 'Core',
    primary: ['lowerBack', 'abs'],
    secondary: ['glutes', 'shoulders'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'On hands and knees, hands under shoulders, knees under hips, spine neutral.',
      'Extend the opposite arm and leg until both are level with the torso.',
      'Do not let the hips rotate — balance a glass of water on your lower back.',
    ],
    videoQuery: 'bird dog exercise proper form',
  },
  {
    name: 'TOETOUCH',
    display: 'Toe Touch',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques', 'hamstrings'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'On your back with legs straight up toward the ceiling.',
      'Curl the shoulder blades off the floor and reach the fingertips toward the toes.',
      'It is a crunch, not a sit-up — the lower back stays down the whole time.',
    ],
    videoQuery: 'toe touch crunch abs proper form',
  },
  {
    name: 'JUMPSQUAT',
    display: 'Jump Squat',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['calves', 'hamstrings', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'Drop into a quarter to half squat, then jump as high as you can.',
      'Land on the whole foot and absorb straight into the next rep.',
      'Stop the set the moment your landings start getting loud — that is fatigue, not effort.',
    ],
    videoQuery: 'jump squat proper form',
  },

  /* ── cycle 6 ── */
  {
    name: 'SITUP',
    display: 'Sit-Up',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques', 'quads'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Knees bent, feet flat, hands crossed on the chest.',
      'Curl up one vertebra at a time until the torso is upright.',
      'Lower with the same control. Hooking the feet under something turns it into a hip flexor exercise.',
    ],
    videoQuery: 'sit up proper form',
  },
  {
    name: 'SNATCH',
    display: 'Snatch',
    group: 'Full',
    primary: ['traps', 'shoulders', 'glutes'],
    secondary: ['hamstrings', 'quads', 'lowerBack', 'forearms'],
    equipment: 'Barbell',
    difficulty: 'Hard',
    howTo: [
      'Very wide grip, bar over mid-foot, hips lower than in a clean.',
      'Accelerate through a violent hip extension, keeping the bar brushing the thighs.',
      'Punch overhead and catch in a deep squat with locked elbows. Coach this one, do not self-teach it.',
    ],
    videoQuery: 'barbell snatch proper form',
  },
  {
    name: 'LEGCURL',
    display: 'Leg Curl',
    group: 'Legs',
    primary: ['hamstrings'],
    secondary: ['calves'],
    equipment: 'Machine',
    difficulty: 'Easy',
    howTo: [
      'Line the knee joint up with the machine pivot before you start.',
      'Curl the heels toward the glutes without the hips lifting off the pad.',
      'Lower over three seconds — hamstrings respond well to a slow negative.',
    ],
    videoQuery: 'lying leg curl machine proper form',
  },
  {
    name: 'SUPERMAN',
    display: 'Superman',
    group: 'Back',
    primary: ['lowerBack'],
    secondary: ['glutes', 'shoulders'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Face down, arms extended overhead, legs straight.',
      'Lift the arms, chest and legs a few inches using the lower back and glutes.',
      'Look at the floor, not forward. Hold two seconds and lower with control.',
    ],
    videoQuery: 'superman back extension exercise proper form',
  },
  {
    name: 'SIDEPLANK',
    display: 'Side Plank',
    group: 'Core',
    primary: ['obliques'],
    secondary: ['abs', 'shoulders', 'glutes'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'Elbow directly under the shoulder, feet stacked or staggered.',
      'Lift the hips until the body is one straight line from ear to ankle.',
      'Push the floor away and do not let the bottom shoulder sink into the joint.',
    ],
    videoQuery: 'side plank proper form',
  },

  /* ── cycle 7 ── */
  {
    name: 'SHRUG',
    display: 'Shrug',
    group: 'Back',
    primary: ['traps'],
    secondary: ['forearms'],
    equipment: 'Dumbbell',
    difficulty: 'Easy',
    howTo: [
      'Stand tall holding the weight at arms length, shoulders relaxed down.',
      'Lift the shoulders straight up toward the ears — no rolling, that does nothing.',
      'Pause at the top, then lower all the way for a full stretch.',
    ],
    videoQuery: 'dumbbell shrug proper form',
  },
  {
    name: 'BRIDGE',
    display: 'Glute Bridge',
    group: 'Legs',
    primary: ['glutes'],
    secondary: ['hamstrings', 'lowerBack', 'abs'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'On your back, knees bent, heels close enough to graze with your fingertips.',
      'Tuck the ribs down, then drive through the heels until the hips are level with the knees.',
      'Squeeze the glutes at the top. If you feel it in the hamstrings, walk the feet closer in.',
    ],
    videoQuery: 'glute bridge proper form',
  },
  {
    name: 'ARMCURL',
    display: 'Biceps Curl',
    group: 'Arms',
    primary: ['biceps'],
    secondary: ['forearms'],
    equipment: 'Dumbbell',
    difficulty: 'Easy',
    howTo: [
      'Elbows pinned at the ribs, shoulders back.',
      'Curl with the biceps only — the upper arm must not swing forward.',
      'Squeeze at the top, then lower over 2–3 seconds. The negative builds the arm.',
    ],
    videoQuery: 'dumbbell biceps curl proper form',
  },
  {
    name: 'THRUSTER',
    display: 'Thruster',
    group: 'Full',
    primary: ['quads', 'shoulders'],
    secondary: ['glutes', 'triceps', 'abs'],
    equipment: 'Barbell',
    difficulty: 'Hard',
    howTo: [
      'Bar racked on the front delts, elbows high, feet shoulder-width.',
      'Squat to full depth, then drive up and let the leg drive throw the bar overhead.',
      'It is one movement, not a squat then a press. Catch the bar back on the shoulders and continue.',
    ],
    videoQuery: 'barbell thruster proper form',
  },
  {
    name: 'BACKSQUAT',
    display: 'Back Squat',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lowerBack', 'abs', 'traps'],
    equipment: 'Barbell',
    difficulty: 'Hard',
    howTo: [
      'Bar on the upper traps, hands squeezing it into your back, elbows down.',
      'Big breath into the belly, brace, then sit down and slightly back.',
      'Drive the whole foot through the floor and keep the bar over mid-foot the entire time.',
    ],
    videoQuery: 'barbell back squat proper form',
  },

  /* ── cycle 8 ── */
  {
    name: 'FLYES',
    display: 'Chest Fly',
    group: 'Chest',
    primary: ['chest'],
    secondary: ['shoulders', 'biceps'],
    equipment: 'Dumbbell',
    difficulty: 'Medium',
    howTo: [
      'Lie back with a soft, fixed elbow bend — that angle never changes.',
      'Open the arms wide until you feel a stretch across the chest, not the shoulder joint.',
      'Hug the weights back together. Go lighter than you think; this is a stretch exercise.',
    ],
    videoQuery: 'dumbbell chest fly proper form',
  },
  {
    name: 'STEPUP',
    display: 'Step-Up',
    group: 'Legs',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves'],
    equipment: 'Bodyweight',
    difficulty: 'Easy',
    howTo: [
      'Use a box that puts the working thigh at roughly parallel.',
      'Plant the whole foot on the box, heel included, and drive up through that heel.',
      'Do not push off the trailing foot. Lower over 2–3 seconds — that is the hard part.',
    ],
    videoQuery: 'box step up proper form',
  },
  {
    name: 'BENTROW',
    display: 'Bent-Over Row',
    group: 'Back',
    primary: ['lats', 'traps'],
    secondary: ['biceps', 'lowerBack', 'forearms'],
    equipment: 'Barbell',
    difficulty: 'Medium',
    howTo: [
      'Hinge to roughly 45 degrees with a flat, braced back and the bar hanging at arms length.',
      'Row to the lower ribs by driving the elbows back, not up.',
      'Squeeze the shoulder blades, then lower fully. No heaving with the torso.',
    ],
    videoQuery: 'barbell bent over row proper form',
  },
  {
    name: 'LEGRAISE',
    display: 'Leg Raise',
    group: 'Core',
    primary: ['abs'],
    secondary: ['obliques', 'quads'],
    equipment: 'Bodyweight',
    difficulty: 'Medium',
    howTo: [
      'On your back, hands under the hips or gripping something overhead.',
      'Press the lower back flat and keep it there — this is the whole game.',
      'Lower straight legs only as far as you can hold that position, then lift back up.',
    ],
    videoQuery: 'lying leg raise proper form',
  },
  {
    name: 'PUSHPRESS',
    display: 'Push Press',
    group: 'Shoulders',
    primary: ['shoulders', 'triceps'],
    secondary: ['quads', 'glutes', 'abs', 'traps'],
    equipment: 'Barbell',
    difficulty: 'Medium',
    howTo: [
      'Start in the overhead press rack position, feet hip-width.',
      'Dip a few inches by bending the knees — torso stays vertical.',
      'Drive the legs explosively and let that momentum carry the bar past the sticking point.',
    ],
    videoQuery: 'barbell push press proper form',
  },
];

/**
 * Accepted as guesses but never the answer — the equivalent of Wordle's
 * separate guess list. These widen each day's candidate pool so the puzzle is
 * deduction rather than enumeration, without needing full coaching content.
 */
const GUESS_ONLY: Exercise[] = [
  // 5
  { name: 'RAISE', display: 'Lateral Raise', group: 'Shoulders', primary: ['shoulders'], secondary: ['traps'], equipment: 'Dumbbell', difficulty: 'Easy' },
  { name: 'HINGE', display: 'Hip Hinge', group: 'Legs', primary: ['hamstrings', 'glutes'], secondary: ['lowerBack'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'CARRY', display: 'Loaded Carry', group: 'Full', primary: ['forearms', 'traps'], secondary: ['abs', 'obliques', 'glutes'], equipment: 'Dumbbell', difficulty: 'Medium' },
  { name: 'TWIST', display: 'Russian Twist', group: 'Core', primary: ['obliques'], secondary: ['abs'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'PULSE', display: 'Squat Pulse', group: 'Legs', primary: ['quads'], secondary: ['glutes'], equipment: 'Bodyweight', difficulty: 'Easy' },
  // 6
  { name: 'SPRINT', display: 'Sprint', group: 'Legs', primary: ['hamstrings', 'quads', 'glutes'], secondary: ['calves', 'abs'], equipment: 'Bodyweight', difficulty: 'Hard' },
  { name: 'SKATER', display: 'Skater Jump', group: 'Legs', primary: ['glutes', 'quads'], secondary: ['calves', 'obliques'], equipment: 'Bodyweight', difficulty: 'Medium' },
  { name: 'ROWING', display: 'Rowing Machine', group: 'Full', primary: ['lats', 'quads'], secondary: ['biceps', 'lowerBack', 'traps'], equipment: 'Machine', difficulty: 'Medium' },
  { name: 'TOETAP', display: 'Toe Tap', group: 'Core', primary: ['abs'], secondary: ['quads'], equipment: 'Bodyweight', difficulty: 'Easy' },
  // 7
  { name: 'FARMERS', display: "Farmer's Carry", group: 'Full', primary: ['forearms', 'traps'], secondary: ['abs', 'obliques', 'glutes'], equipment: 'Dumbbell', difficulty: 'Medium' },
  { name: 'JUMPING', display: 'Jumping Jack', group: 'Full', primary: ['calves', 'shoulders'], secondary: ['quads', 'glutes'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'LATPULL', display: 'Lat Pulldown', group: 'Back', primary: ['lats'], secondary: ['biceps', 'traps', 'forearms'], equipment: 'Machine', difficulty: 'Easy' },
  // 8
  { name: 'SKIPROPE', display: 'Jump Rope', group: 'Full', primary: ['calves'], secondary: ['quads', 'shoulders', 'forearms'], equipment: 'Bodyweight', difficulty: 'Medium' },
  { name: 'CRABWALK', display: 'Crab Walk', group: 'Full', primary: ['triceps', 'glutes'], secondary: ['shoulders', 'abs', 'hamstrings'], equipment: 'Bodyweight', difficulty: 'Medium' },
  { name: 'SIDEBEND', display: 'Side Bend', group: 'Core', primary: ['obliques'], secondary: ['abs', 'lowerBack'], equipment: 'Dumbbell', difficulty: 'Easy' },
  { name: 'HIPRAISE', display: 'Hip Raise', group: 'Legs', primary: ['glutes'], secondary: ['hamstrings', 'lowerBack'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'SLEDPUSH', display: 'Sled Push', group: 'Full', primary: ['quads', 'glutes'], secondary: ['calves', 'chest', 'shoulders'], equipment: 'Machine', difficulty: 'Hard' },
  { name: 'INCHWORM', display: 'Inchworm', group: 'Full', primary: ['abs', 'shoulders'], secondary: ['chest', 'hamstrings'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'TUCKJUMP', display: 'Tuck Jump', group: 'Legs', primary: ['quads'], secondary: ['calves', 'abs', 'glutes'], equipment: 'Bodyweight', difficulty: 'Hard' },
  { name: 'FACEPULL', display: 'Face Pull', group: 'Back', primary: ['traps', 'shoulders'], secondary: ['lats', 'biceps'], equipment: 'Machine', difficulty: 'Easy' },
  { name: 'PUSHDOWN', display: 'Triceps Pushdown', group: 'Arms', primary: ['triceps'], secondary: ['forearms'], equipment: 'Machine', difficulty: 'Easy' },
  { name: 'CHESTFLY', display: 'Cable Chest Fly', group: 'Chest', primary: ['chest'], secondary: ['shoulders'], equipment: 'Machine', difficulty: 'Easy' },
  { name: 'FROGJUMP', display: 'Frog Jump', group: 'Legs', primary: ['quads', 'glutes'], secondary: ['calves'], equipment: 'Bodyweight', difficulty: 'Medium' },
  { name: 'SIDEKICK', display: 'Side Kick', group: 'Legs', primary: ['glutes'], secondary: ['obliques', 'quads'], equipment: 'Bodyweight', difficulty: 'Easy' },
  // 9
  { name: 'ARMCIRCLE', display: 'Arm Circle', group: 'Shoulders', primary: ['shoulders'], secondary: ['traps'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'HANGCLEAN', display: 'Hang Clean', group: 'Full', primary: ['traps', 'glutes', 'hamstrings'], secondary: ['quads', 'forearms', 'shoulders'], equipment: 'Barbell', difficulty: 'Hard' },
  { name: 'HANDSTAND', display: 'Handstand Hold', group: 'Shoulders', primary: ['shoulders'], secondary: ['triceps', 'abs', 'forearms'], equipment: 'Bodyweight', difficulty: 'Hard' },
  { name: 'KNEERAISE', display: 'Hanging Knee Raise', group: 'Core', primary: ['abs'], secondary: ['obliques', 'forearms', 'quads'], equipment: 'Bodyweight', difficulty: 'Medium' },
  { name: 'HEELTOUCH', display: 'Heel Touch', group: 'Core', primary: ['obliques'], secondary: ['abs'], equipment: 'Bodyweight', difficulty: 'Easy' },
  { name: 'HIPBRIDGE', display: 'Single-Leg Bridge', group: 'Legs', primary: ['glutes'], secondary: ['hamstrings', 'abs'], equipment: 'Bodyweight', difficulty: 'Medium' },
];

/** Everything typeable. Answers first, so lookups prefer the richer record. */
export const CATALOGUE: Exercise[] = [...ANSWERS, ...GUESS_ONLY];

const BY_NAME = new Map(CATALOGUE.map((e) => [e.name, e]));

/** Guessable words for a given answer length, alphabetical. */
const BY_LENGTH = new Map<number, Exercise[]>();
for (const e of CATALOGUE) {
  const bucket = BY_LENGTH.get(e.name.length) ?? [];
  bucket.push(e);
  BY_LENGTH.set(e.name.length, bucket);
}
for (const bucket of BY_LENGTH.values()) {
  bucket.sort((a, b) => a.name.localeCompare(b.name));
}

export function getExercise(name: string): Exercise | undefined {
  return BY_NAME.get(name.toUpperCase());
}

export function exercisesOfLength(length: number): Exercise[] {
  return BY_LENGTH.get(length) ?? [];
}

/** A guess must be a real exercise of the same length as the answer. */
export function isValidGuess(word: string, length: number): boolean {
  const e = BY_NAME.get(word.toUpperCase());
  return e !== undefined && e.name.length === length;
}

/** Every muscle an exercise touches, primary and secondary. */
export function musclesOf(e: Exercise): Set<MuscleRegion> {
  return new Set([...e.primary, ...e.secondary]);
}

export function formVideoUrl(a: Answer): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(a.videoQuery)}`;
}

export const MAX_GUESSES = 6;
/** Guess number at which each hint unlocks. */
export const CATEGORY_HINT_AT = 3;
export const EQUIPMENT_HINT_AT = 5;
