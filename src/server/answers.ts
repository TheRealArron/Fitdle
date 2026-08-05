import 'server-only';

/**
 * SERVER ONLY. This module must never reach the browser.
 *
 * The `server-only` import above turns an accidental client import into a
 * build error rather than a silent leak.
 *
 * What is secret is NOT the word list. The 99 guessable names are a deliberate
 * product feature - the in-app exercise index hands them over, because nobody
 * carries a list of exercise names in their head the way they carry common
 * English. Publishing them costs nothing.
 *
 * What is secret is the ORDERING. `ANSWER_ORDER[seed % length]` is the entire
 * mapping from date to answer; ship it and every future puzzle is readable in
 * devtools. The coaching payload lives here too, so a client cannot infer the
 * answer set from which exercises happen to have how-to text.
 */

/** ORDER IS PROTOCOL - see the caveat in data/exercises.ts. */
export const ANSWER_ORDER: readonly string[] = [
  "SQUAT", "BURPEE", "CLIMBER", "DEADLIFT", "HIPTHRUST", "PLANK", "CRUNCH", "BOXJUMP", "PULLOVER",
  "BEARCRAWL", "LUNGE", "PUSHUP", "DEADBUG", "KICKBACK", "CALFRAISE", "PRESS", "PULLUP", "WALLSIT",
  "LEGPRESS", "SEATEDROW", "CLEAN", "CHINUP", "BIRDDOG", "TOETOUCH", "JUMPSQUAT", "SITUP",
  "SNATCH", "LEGCURL", "SUPERMAN", "SIDEPLANK", "SHRUG", "BRIDGE", "ARMCURL", "THRUSTER", "BACKSQUAT",
  "FLYES", "STEPUP", "BENTROW", "LEGRAISE", "PUSHPRESS", "RAISE", "SPRINT", "FARMERS", "SKIPROPE",
  "HANGCLEAN", "TWIST", "SKATER", "JUMPING", "FACEPULL", "HANDSTAND", "SWING", "ROWING", "LATPULL",
  "PUSHDOWN", "KNEERAISE", "HINGE", "HOLLOW", "PISTOLS", "INCHWORM", "ARMCIRCLE"
];

export interface Coaching {
  howTo: string[];
  videoQuery: string;
  videoId: string | null;
  challenge: string;
}

export const COACHING: Record<string, Coaching> = {
  SQUAT: {
    howTo: [
      "Feet shoulder-width, toes turned out 15–30 degrees.",
      "Break at the hips and knees together, chest tall, weight on mid-foot.",
      "Descend until the hip crease passes the knee, then stand without letting the knees cave.",
    ],
    videoQuery: "bodyweight squat proper form",
    videoId: "otzWCWpuW-A",
    challenge: "3 × 15",
  },
  BURPEE: {
    howTo: [
      "Squat down, plant both hands shoulder-width, and shoot the feet back to a rigid plank.",
      "Optional chest-to-floor push-up, then snap the feet back under your hips.",
      "Explode into a vertical jump and land softly on bent knees.",
    ],
    videoQuery: "burpee proper form",
    videoId: "wGvBfVeCNko",
    challenge: "4 × 8",
  },
  CLIMBER: {
    howTo: [
      "Start in a high plank with hands under the shoulders and hips level.",
      "Drive one knee toward your chest without letting the hips pike up.",
      "Alternate legs quickly, keeping the shoulders stacked over the wrists.",
    ],
    videoQuery: "mountain climber exercise proper form",
    videoId: "ZhiCSdOVJp0",
    challenge: "3 × 30 seconds",
  },
  DEADLIFT: {
    howTo: [
      "Bar over mid-foot, shins an inch away, grip just outside the knees.",
      "Set a flat back and pull the slack out of the bar before it moves.",
      "Push the floor away - hips and shoulders rise together. Lock out with glutes, not by leaning back.",
    ],
    videoQuery: "conventional deadlift proper form",
    videoId: "GxsLrTzyGUU",
    challenge: "3 × 5",
  },
  HIPTHRUST: {
    howTo: [
      "Upper back on a bench, feet flat and shin vertical at the top.",
      "Tuck the ribs down and drive through the heels until hips are level with knees.",
      "Squeeze the glutes hard for a second - do not arch the lower back to get higher.",
    ],
    videoQuery: "barbell hip thrust proper form",
    videoId: "pF17m_CXfL0",
    challenge: "3 × 12",
  },
  PLANK: {
    howTo: [
      "Forearms under the shoulders, elbows at 90 degrees.",
      "Squeeze the glutes and brace the ribs down so the spine stays neutral.",
      "Hold a straight line from ear to heel - no sagging hips, no piking. Quality beats duration.",
    ],
    videoQuery: "plank exercise proper form",
    videoId: "A2b2EmIg0dA",
    challenge: "3 × 45 seconds",
  },
  CRUNCH: {
    howTo: [
      "Lie back, knees bent, feet flat, hands light at the temples.",
      "Curl the ribcage toward the pelvis - this is a short range of motion.",
      "Leave a fist of space under the chin; never pull on the neck.",
    ],
    videoQuery: "abdominal crunch proper form",
    videoId: "tnZNcIqhGb0",
    challenge: "3 × 20",
  },
  BOXJUMP: {
    howTo: [
      "Stand a foot from the box, dip to a quarter squat and swing the arms back.",
      "Jump and land softly in a quarter squat with the whole foot on the box.",
      "Step down, never jump down - that is where Achilles injuries come from.",
    ],
    videoQuery: "box jump proper form",
    videoId: "G-bxQY57mKc",
    challenge: "4 × 6",
  },
  PULLOVER: {
    howTo: [
      "Lie across or along a bench, holding one dumbbell over the chest with both hands.",
      "Keep a soft elbow bend and lower the weight back over your head until you feel the lats stretch.",
      "Pull it back over the chest with the lats, keeping the ribs down throughout.",
    ],
    videoQuery: "dumbbell pullover proper form",
    videoId: "moKuOuFNBDM",
    challenge: "3 × 12",
  },
  BEARCRAWL: {
    howTo: [
      "Hands under shoulders, knees under hips and hovering an inch off the floor.",
      "Move the opposite hand and foot together, keeping the knees low.",
      "Hips stay level - if they rock side to side, shorten your steps.",
    ],
    videoQuery: "bear crawl exercise proper form",
    videoId: "U3Y58Kyw7Xw",
    challenge: "3 × 20 metres",
  },
  LUNGE: {
    howTo: [
      "Step forward far enough that both knees can reach 90 degrees.",
      "Torso upright, front shin close to vertical.",
      "Lower until the back knee hovers just above the floor, then push through the front heel.",
    ],
    videoQuery: "forward lunge proper form",
    videoId: "krXwDPKKiSM",
    challenge: "3 × 10 each leg",
  },
  PUSHUP: {
    howTo: [
      "Hands slightly wider than the shoulders, body in one rigid line.",
      "Lower until the chest is a fist from the floor, elbows at roughly 45 degrees.",
      "Press away and keep the glutes squeezed so the hips never sag.",
    ],
    videoQuery: "push up proper form",
    videoId: "ABbVpmubIGQ",
    challenge: "3 × 12",
  },
  DEADBUG: {
    howTo: [
      "On your back, arms straight up, hips and knees at 90 degrees.",
      "Press the lower back into the floor and hold it there - that is the whole exercise.",
      "Slowly extend the opposite arm and leg, return, then switch. Stop when the back lifts.",
    ],
    videoQuery: "dead bug core exercise proper form",
    videoId: "bxn9FBrt4-A",
    challenge: "3 × 8 each side",
  },
  KICKBACK: {
    howTo: [
      "Hinge forward to about 45 degrees with a flat back, upper arm pinned to your side.",
      "Straighten the elbow until the arm is parallel with the torso.",
      "Squeeze at lockout, then lower slowly. The upper arm must not move.",
    ],
    videoQuery: "dumbbell triceps kickback proper form",
    videoId: "m9me06UBPKc",
    challenge: "3 × 15",
  },
  CALFRAISE: {
    howTo: [
      "Stand with the balls of the feet on a step, heels hanging free.",
      "Drop the heels for a full stretch, then press up as high as the ankle allows.",
      "Pause at the top for a second. Speed here is wasted effort.",
    ],
    videoQuery: "standing calf raise proper form",
    videoId: "SVtg-1loH4c",
    challenge: "4 × 20",
  },
  PRESS: {
    howTo: [
      "Bar on the front delts, grip just outside the shoulders, elbows slightly ahead.",
      "Squeeze the glutes and abs so the ribs cannot flare.",
      "Press up and move the head back out of the way, finishing with the bar over mid-foot.",
    ],
    videoQuery: "standing overhead press proper form",
    videoId: "nNMR9fRGRjQ",
    challenge: "3 × 8",
  },
  PULLUP: {
    howTo: [
      "Overhand grip just outside shoulder width, hanging from straight arms.",
      "Pull the shoulder blades down first, then drive the elbows toward the ribs.",
      "Chin clears the bar, then lower all the way to a dead hang. No kipping.",
    ],
    videoQuery: "pull up proper form",
    videoId: "MhokcbRLP5w",
    challenge: "3 × 5",
  },
  WALLSIT: {
    howTo: [
      "Back flat against a wall, walk the feet out until knees and hips are both at 90 degrees.",
      "Knees stack over the ankles, weight through the heels.",
      "Hold. Breathe normally - holding your breath makes it much harder than it needs to be.",
    ],
    videoQuery: "wall sit exercise proper form",
    videoId: "JaZNYM3zAP0",
    challenge: "3 × 45 seconds",
  },
  LEGPRESS: {
    howTo: [
      "Feet shoulder-width in the middle of the platform, whole foot in contact.",
      "Lower until the knees reach about 90 degrees - stop before the pelvis tucks.",
      "Press back without snapping the knees into a hard lockout.",
    ],
    videoQuery: "leg press machine proper form",
    videoId: "K5n2vg3oZa4",
    challenge: "3 × 12",
  },
  SEATEDROW: {
    howTo: [
      "Chest tall, slight forward lean at the start, knees softly bent.",
      "Pull the handle to the navel by driving the elbows back past the ribs.",
      "Squeeze the shoulder blades together, then let the arms extend fully under control.",
    ],
    videoQuery: "seated cable row proper form",
    videoId: "7BkgqzC6WsM",
    challenge: "3 × 12",
  },
  CLEAN: {
    howTo: [
      "Start like a deadlift: bar over mid-foot, flat back, arms straight.",
      "Push the floor away, then violently extend hips, knees and ankles.",
      "Pull under the bar and catch it on the front delts with the elbows whipping through fast.",
    ],
    videoQuery: "power clean proper form",
    videoId: "lI35socHJ4k",
    challenge: "5 × 3",
  },
  CHINUP: {
    howTo: [
      "Underhand grip at about shoulder width, hanging from straight arms.",
      "Lead with the chest and drive the elbows down toward your pockets.",
      "The supinated grip gives the biceps more leverage - expect a few more reps than pull-ups.",
    ],
    videoQuery: "chin up proper form",
    videoId: "e1YSApl-QcM",
    challenge: "3 × 6",
  },
  BIRDDOG: {
    howTo: [
      "On hands and knees, hands under shoulders, knees under hips, spine neutral.",
      "Extend the opposite arm and leg until both are level with the torso.",
      "Do not let the hips rotate - balance a glass of water on your lower back.",
    ],
    videoQuery: "bird dog exercise proper form",
    videoId: "ZdAHe9_HeEw",
    challenge: "3 × 10 each side",
  },
  TOETOUCH: {
    howTo: [
      "On your back with legs straight up toward the ceiling.",
      "Curl the shoulder blades off the floor and reach the fingertips toward the toes.",
      "It is a crunch, not a sit-up - the lower back stays down the whole time.",
    ],
    videoQuery: "toe touch crunch abs proper form",
    videoId: "9iEI95-eZWk",
    challenge: "3 × 20",
  },
  JUMPSQUAT: {
    howTo: [
      "Drop into a quarter to half squat, then jump as high as you can.",
      "Land on the whole foot and absorb straight into the next rep.",
      "Stop the set the moment your landings start getting loud - that is fatigue, not effort.",
    ],
    videoQuery: "jump squat proper form",
    videoId: "tZSYZdtbONc",
    challenge: "4 × 10",
  },
  SITUP: {
    howTo: [
      "Knees bent, feet flat, hands crossed on the chest.",
      "Curl up one vertebra at a time until the torso is upright.",
      "Lower with the same control. Hooking the feet under something turns it into a hip flexor exercise.",
    ],
    videoQuery: "sit up proper form",
    videoId: "iL06z9PWYs8",
    challenge: "3 × 20",
  },
  SNATCH: {
    howTo: [
      "Very wide grip, bar over mid-foot, hips lower than in a clean.",
      "Accelerate through a violent hip extension, keeping the bar brushing the thighs.",
      "Punch overhead and catch in a deep squat with locked elbows. Coach this one, do not self-teach it.",
    ],
    videoQuery: "barbell snatch proper form",
    videoId: "3O7JjPr0_ok",
    challenge: "5 × 2",
  },
  LEGCURL: {
    howTo: [
      "Line the knee joint up with the machine pivot before you start.",
      "Curl the heels toward the glutes without the hips lifting off the pad.",
      "Lower over three seconds - hamstrings respond well to a slow negative.",
    ],
    videoQuery: "lying leg curl machine proper form",
    videoId: "lUH80pneL5w",
    challenge: "3 × 12",
  },
  SUPERMAN: {
    howTo: [
      "Face down, arms extended overhead, legs straight.",
      "Lift the arms, chest and legs a few inches using the lower back and glutes.",
      "Look at the floor, not forward. Hold two seconds and lower with control.",
    ],
    videoQuery: "superman back extension exercise proper form",
    videoId: "UXUGfiNL1lI",
    challenge: "3 × 12",
  },
  SIDEPLANK: {
    howTo: [
      "Elbow directly under the shoulder, feet stacked or staggered.",
      "Lift the hips until the body is one straight line from ear to ankle.",
      "Push the floor away and do not let the bottom shoulder sink into the joint.",
    ],
    videoQuery: "side plank proper form",
    videoId: "iNbH7_edNI8",
    challenge: "3 × 30 seconds each side",
  },
  SHRUG: {
    howTo: [
      "Stand tall holding the weight at arms length, shoulders relaxed down.",
      "Lift the shoulders straight up toward the ears - no rolling, that does nothing.",
      "Pause at the top, then lower all the way for a full stretch.",
    ],
    videoQuery: "dumbbell shrug proper form",
    videoId: "YJ2q8RkOFVw",
    challenge: "3 × 15",
  },
  BRIDGE: {
    howTo: [
      "On your back, knees bent, heels close enough to graze with your fingertips.",
      "Tuck the ribs down, then drive through the heels until the hips are level with the knees.",
      "Squeeze the glutes at the top. If you feel it in the hamstrings, walk the feet closer in.",
    ],
    videoQuery: "glute bridge proper form",
    videoId: "wPM8icPu6H8",
    challenge: "3 × 15",
  },
  ARMCURL: {
    howTo: [
      "Elbows pinned at the ribs, shoulders back.",
      "Curl with the biceps only - the upper arm must not swing forward.",
      "Squeeze at the top, then lower over 2–3 seconds. The negative builds the arm.",
    ],
    videoQuery: "dumbbell biceps curl proper form",
    videoId: "Jfp4b5Olc7A",
    challenge: "3 × 12",
  },
  THRUSTER: {
    howTo: [
      "Bar racked on the front delts, elbows high, feet shoulder-width.",
      "Squat to full depth, then drive up and let the leg drive throw the bar overhead.",
      "It is one movement, not a squat then a press. Catch the bar back on the shoulders and continue.",
    ],
    videoQuery: "barbell thruster proper form",
    videoId: "z0PGxb8BSq8",
    challenge: "4 × 8",
  },
  BACKSQUAT: {
    howTo: [
      "Bar on the upper traps, hands squeezing it into your back, elbows down.",
      "Big breath into the belly, brace, then sit down and slightly back.",
      "Drive the whole foot through the floor and keep the bar over mid-foot the entire time.",
    ],
    videoQuery: "barbell back squat proper form",
    videoId: "8PMjqgR8Wa8",
    challenge: "4 × 6",
  },
  FLYES: {
    howTo: [
      "Lie back with a soft, fixed elbow bend - that angle never changes.",
      "Open the arms wide until you feel a stretch across the chest, not the shoulder joint.",
      "Hug the weights back together. Go lighter than you think; this is a stretch exercise.",
    ],
    videoQuery: "dumbbell chest fly proper form",
    videoId: "ul7j4OkNRq4",
    challenge: "3 × 12",
  },
  STEPUP: {
    howTo: [
      "Use a box that puts the working thigh at roughly parallel.",
      "Plant the whole foot on the box, heel included, and drive up through that heel.",
      "Do not push off the trailing foot. Lower over 2–3 seconds - that is the hard part.",
    ],
    videoQuery: "box step up proper form",
    videoId: "vOiHvzj5XhA",
    challenge: "3 × 10 each leg",
  },
  BENTROW: {
    howTo: [
      "Hinge to roughly 45 degrees with a flat, braced back and the bar hanging at arms length.",
      "Row to the lower ribs by driving the elbows back, not up.",
      "Squeeze the shoulder blades, then lower fully. No heaving with the torso.",
    ],
    videoQuery: "barbell bent over row proper form",
    videoId: "rqTOAM8WoeM",
    challenge: "3 × 10",
  },
  LEGRAISE: {
    howTo: [
      "On your back, hands under the hips or gripping something overhead.",
      "Press the lower back flat and keep it there - this is the whole game.",
      "Lower straight legs only as far as you can hold that position, then lift back up.",
    ],
    videoQuery: "lying leg raise proper form",
    videoId: "S_AK2Qv8_q8",
    challenge: "3 × 12",
  },
  PUSHPRESS: {
    howTo: [
      "Start in the overhead press rack position, feet hip-width.",
      "Dip a few inches by bending the knees - torso stays vertical.",
      "Drive the legs explosively and let that momentum carry the bar past the sticking point.",
    ],
    videoQuery: "barbell push press proper form",
    videoId: "Hqxjk5Z35SM",
    challenge: "4 × 5",
  },
  RAISE: {
    howTo: [
      "Stand tall with a slight fixed bend in the elbows, dumbbells at your sides.",
      "Lift out to the sides until the arms are level with the shoulders, leading with the elbows.",
      "Lower over three seconds. If you have to swing to get them up, go lighter.",
    ],
    videoQuery: "dumbbell lateral raise proper form",
    videoId: "nnH63icHYXY",
    challenge: "3 × 15",
  },
  SPRINT: {
    howTo: [
      "Drive the knee up and put the foot down underneath you, not out in front.",
      "Torso tall, arms swinging hip to cheek with the elbows at 90 degrees.",
      "Build to full speed over 20–30 metres rather than exploding from cold.",
    ],
    videoQuery: "proper sprinting form technique",
    videoId: "6m_fjNhRhkY",
    challenge: "6 × 40 metres",
  },
  FARMERS: {
    howTo: [
      "Pick the weights up with a deadlift, not a bend-and-grab.",
      "Stand tall, shoulders back, ribs down, and walk with short controlled steps.",
      "Stop when your posture breaks, not when your grip does.",
    ],
    videoQuery: "farmer's carry proper form",
    videoId: "lLAw6fUccKA",
    challenge: "3 × 30 metres",
  },
  SKIPROPE: {
    howTo: [
      "Rope length: stand on the middle and the handles should reach your armpits.",
      "Turn the rope with the wrists, not the shoulders. Elbows stay close to the ribs.",
      "Jump an inch off the floor and land on the balls of the feet - heels never touch.",
    ],
    videoQuery: "jump rope technique beginners",
    videoId: "nMHfZ-yrFjA",
    challenge: "5 × 60 seconds",
  },
  HANGCLEAN: {
    howTo: [
      "Start standing with the bar at mid-thigh, shoulders slightly over it.",
      "Hinge to just above the knee, then explode - hips, knees and ankles together.",
      "Pull under and catch on the front delts with the elbows whipping through fast.",
    ],
    videoQuery: "barbell hang clean technique",
    videoId: "HZOR7y9LcoA",
    challenge: "5 × 3",
  },
  TWIST: {
    howTo: [
      "Sit with knees bent and heels light on the floor, chest tall, leaning back about 45 degrees.",
      "Rotate the whole ribcage until your hands pass your hip - not just the arms.",
      "Move slowly. Speed here turns it into arm-waving.",
    ],
    videoQuery: "russian twist proper form",
    videoId: "IJDOoVyVjhc",
    challenge: "3 × 20 total",
  },
  SKATER: {
    howTo: [
      "Bound sideways off one leg and land softly on the other, trailing foot behind.",
      "Land on the whole foot with the knee tracking over the toes.",
      "Pause a beat on each landing before bounding back the other way.",
    ],
    videoQuery: "skater jump exercise proper form",
    videoId: "9_jLW6VkU8A",
    challenge: "3 × 12 each side",
  },
  JUMPING: {
    howTo: [
      "Start with feet together and arms at your sides.",
      "Jump the feet wide while the arms sweep overhead, landing on the balls of the feet.",
      "Stay light and quiet - loud landings mean you are collapsing through the ankles.",
    ],
    videoQuery: "jumping jacks proper form",
    videoId: "uLVt6u15L98",
    challenge: "3 × 40",
  },
  FACEPULL: {
    howTo: [
      "Set the cable at upper-chest height with a rope, palms facing in.",
      "Pull toward your forehead, splitting the rope and driving the elbows high and back.",
      "Finish with the hands beside your ears. Light weight, high reps, every session.",
    ],
    videoQuery: "face pull proper form",
    videoId: "eTCBSFlCJ_s",
    challenge: "3 × 15",
  },
  HANDSTAND: {
    howTo: [
      "Start chest-to-wall: walk your feet up until the body is one straight line.",
      "Push the floor away, stack shoulders over wrists, squeeze the ribs down.",
      "Come down before your alignment breaks, not after it.",
    ],
    videoQuery: "handstand hold wall beginner tutorial",
    videoId: "sdnSvETgPbU",
    challenge: "4 × 20 seconds",
  },
  SWING: {
    howTo: [
      "Hinge at the hips with a flat back and hike the bell behind you like a snap pass.",
      "Snap the hips forward hard - the bell floats up, you never lift it with the arms.",
      "Let it fall and absorb with another hinge. This is a hinge, not a squat.",
    ],
    videoQuery: "kettlebell swing proper form",
    videoId: "bDCeXbMJVNs",
    challenge: "4 × 15",
  },
  ROWING: {
    howTo: [
      "Drive: legs, then body, then arms. Recovery: arms, then body, then legs.",
      "Push with the legs first - the stroke is roughly 60% legs, 30% hips, 10% arms.",
      "Pull the handle to the bottom of the ribs and never round the lower back.",
    ],
    videoQuery: "rowing machine proper technique",
    videoId: "4zWu1yuJ0_g",
    challenge: "4 × 250 metres",
  },
  LATPULL: {
    howTo: [
      "Thighs locked under the pads, grip just outside shoulder width.",
      "Lean back slightly, pull the shoulder blades down first, then the elbows to the ribs.",
      "Bring the bar to the collarbone. Never behind the neck.",
    ],
    videoQuery: "lat pulldown proper form",
    videoId: "CAwf7n6Luuc",
    challenge: "3 × 12",
  },
  PUSHDOWN: {
    howTo: [
      "Elbows pinned at your sides - they do not travel forward at any point.",
      "Push down until the arms lock, then spread the rope apart at the bottom.",
      "Come back up only until the forearms reach parallel, then go again.",
    ],
    videoQuery: "cable triceps pushdown proper form",
    videoId: "_w-HpW70nSQ",
    challenge: "3 × 15",
  },
  KNEERAISE: {
    howTo: [
      "Hang from a bar with the shoulders pulled down away from your ears.",
      "Curl the knees up by tilting the pelvis, not just folding at the hip.",
      "Lower slowly and kill the swing completely before the next rep.",
    ],
    videoQuery: "hanging knee raise proper form",
    videoId: "l7OroezzX9k",
    challenge: "3 × 10",
  },
  HINGE: {
    howTo: [
      "Feet hip-width, knees soft, hands resting on the crease of your hips.",
      "Push the hips straight back and let the chest fall forward with a flat back.",
      "Stop when the hamstrings tighten, then drive the hips forward to stand tall.",
    ],
    videoQuery: "hip hinge proper form beginners",
    videoId: "Dn3GexXx228",
    challenge: "3 × 12",
  },
  HOLLOW: {
    howTo: [
      "On your back, press the lower back flat into the floor. That never changes.",
      "Lift the shoulder blades and the legs a few inches, arms reaching overhead.",
      "Lower the legs only as far as you can hold the back down. Bend the knees to regress.",
    ],
    videoQuery: "hollow body hold proper form",
    videoId: "014nAtTPTFo",
    challenge: "3 × 20 seconds",
  },
  PISTOLS: {
    howTo: [
      "Stand on one leg with the other extended in front, arms forward as a counterweight.",
      "Sit back and down slowly, keeping the standing heel planted.",
      "Regress to a box or hold a support until you can control the whole descent.",
    ],
    videoQuery: "pistol squat progression tutorial",
    videoId: "hHxm3VbuS-w",
    challenge: "3 × 5 each leg",
  },
  INCHWORM: {
    howTo: [
      "Stand tall, hinge and place your hands on the floor, bending the knees as needed.",
      "Walk the hands out to a plank without letting the hips sag.",
      "Walk them back in, stand up, repeat. Core braced the whole way.",
    ],
    videoQuery: "inchworm exercise proper form",
    videoId: "aFkv2m9FTGs",
    challenge: "3 × 8",
  },
  ARMCIRCLE: {
    howTo: [
      "Stand with the arms straight out to the sides so the body forms a T.",
      "Draw small circles forward, growing them gradually, then reverse direction.",
      "This is a warm-up, not a strength move - keep it light and controlled.",
    ],
    videoQuery: "arm circles warm up proper form",
    videoId: "tYo5ghpLksg",
    challenge: "2 × 20 each way",
  },
};
