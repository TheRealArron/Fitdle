import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE } from '@/data/exercises';
import { ANSWER_ORDER, COACHING } from '@/server/answers';

// Rejoin what the client/server split separated, for assertions only.
const ANSWERS = ANSWER_ORDER.map((name) => ({
  ...CATALOGUE.find((e) => e.name === name)!,
  ...COACHING[name],
}));
import { mergeSaves } from '@/lib/cloudSync';
import {
  commitWorkout,
  defaultSave,
  normalise,
  reconcile,
  type SaveData,
} from '@/lib/secureStorage';

const make = (o: Partial<SaveData>): SaveData => ({ ...defaultSave(), ...o });

test('every answer carries a real prescription', () => {
  for (const a of ANSWERS) {
    assert.ok(a.challenge && a.challenge.length > 2, `${a.name} has no challenge`);
    // Sets × something. A bare number would be meaningless advice.
    assert.match(a.challenge, /^\d+\s×\s/, `${a.name}: "${a.challenge}" is not sets × reps/time`);
  }
});

test('holds and carries are prescribed in time or distance, not reps', () => {
  // "3 × 15 planks" is not a thing. Spot-check the ones where it matters.
  const byName = Object.fromEntries(ANSWERS.map((a) => [a.name, a.challenge]));
  assert.match(byName.PLANK, /second/);
  assert.match(byName.WALLSIT, /second/);
  assert.match(byName.HOLLOW, /second/);
  assert.match(byName.FARMERS, /metre/);
  assert.match(byName.SPRINT, /metre/);
});

test('a workout can only be logged once per day', () => {
  let save = defaultSave();
  save = commitWorkout(save, 20260801);
  assert.equal(save.workoutStreak, 1);
  assert.equal(save.workoutsDone, 1);

  // Spamming the button must not inflate anything.
  save = commitWorkout(save, 20260801);
  save = commitWorkout(save, 20260801);
  assert.equal(save.workoutStreak, 1);
  assert.equal(save.workoutsDone, 1);
});

test('consecutive days build the workout streak', () => {
  let save = defaultSave();
  for (const seed of [20260730, 20260731, 20260801]) {
    save = reconcile(save, seed).save;
    save = commitWorkout(save, seed);
  }
  assert.equal(save.workoutStreak, 3);
  assert.equal(save.maxWorkoutStreak, 3);
});

test('a missed day breaks the workout streak but keeps the record', () => {
  let save = defaultSave();
  save = commitWorkout(save, 20260729);
  save = commitWorkout(reconcile(save, 20260730).save, 20260730);
  assert.equal(save.workoutStreak, 2);

  // 31st skipped entirely.
  const r = reconcile(save, 20260801);
  assert.equal(r.save.workoutStreak, 0);
  assert.equal(r.save.maxWorkoutStreak, 2, 'the record must survive');
});

test('the workout streak is independent of the puzzle streak', () => {
  // Solving without training, and training without solving, must both be possible.
  let save = defaultSave();
  save = commitWorkout(save, 20260801);
  assert.equal(save.workoutStreak, 1);
  assert.equal(save.streak, 0, 'logging a workout must not award a puzzle streak');
});

test('old saves without workout fields load rather than being rejected', () => {
  /*
   * These fields were added after people had saves. If `normalise` did not fill
   * them in, an existing record would fail the coherence check, be treated as
   * tampering, and wipe a real streak - the exact bug that bit the variable
   * length change.
   */
  const legacy = { ...defaultSave() } as Partial<SaveData>;
  delete legacy.workoutStreak;
  delete legacy.maxWorkoutStreak;
  delete legacy.workoutsDone;
  delete legacy.lastWorkoutSeed;

  const n = normalise(legacy as SaveData);
  assert.equal(n.workoutStreak, 0);
  assert.equal(n.maxWorkoutStreak, 0);
  assert.equal(n.workoutsDone, 0);
  assert.equal(n.lastWorkoutSeed, null);
});

test('workout fields survive a cloud merge on the same rules as the puzzle streak', () => {
  const phone = make({
    workoutsDone: 9, workoutStreak: 3, maxWorkoutStreak: 6, lastWorkoutSeed: 20260801,
  });
  const laptop = make({
    workoutsDone: 4, workoutStreak: 4, maxWorkoutStreak: 4, lastWorkoutSeed: 20260725,
  });

  const m = mergeSaves(phone, laptop);
  assert.equal(m.workoutsDone, 9, 'counters take the max');
  assert.equal(m.maxWorkoutStreak, 6, 'records take the max');
  assert.equal(m.workoutStreak, 3, 'the live streak comes from the more recent device');
  assert.equal(m.lastWorkoutSeed, 20260801);
  assert.deepEqual(mergeSaves(phone, laptop), mergeSaves(laptop, phone), 'order-independent');
});

test('merging a device that never logged a workout does not zero the streak', () => {
  const active = make({
    workoutsDone: 5, workoutStreak: 5, maxWorkoutStreak: 5, lastWorkoutSeed: 20260801,
  });
  const fresh = defaultSave();
  assert.equal(mergeSaves(active, fresh).workoutStreak, 5);
  assert.equal(mergeSaves(fresh, active).workoutStreak, 5);
});

test('no answer is ever the only exercise training one of its own muscles', () => {
  /*
   * Regression guard for a real leak.
   *
   * The muscle-detail panel lists other exercises that train the tapped muscle,
   * and it now excludes the answer at all times. But if an answer were the ONLY
   * exercise touching some muscle, excluding it would leave an empty list - and
   * an empty list where every other muscle has suggestions is itself a tell.
   *
   * This asserts every muscle each answer works is also worked by something
   * else, so the exclusion is always invisible.
   */
  for (const a of ANSWERS) {
    for (const m of [...a.primary, ...a.secondary]) {
      const others = CATALOGUE.filter(
        (e) => e.name !== a.name && (e.primary.includes(m) || e.secondary.includes(m)),
      );
      assert.ok(
        others.length > 0,
        `${a.name} is the only exercise working ${m} - excluding it would leave an empty list`,
      );
    }
  }
});
