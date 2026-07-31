import assert from 'node:assert/strict';
import test from 'node:test';
import { getExercise, musclesOf } from '@/data/exercises';
import type { MuscleRegion } from '@/data/muscles';
import { accumulateMuscleFeedback, discoveryRatio } from '@/lib/muscleFeedback';

const ex = (name: string) => {
  const e = getExercise(name);
  assert.ok(e, `${name} missing from catalogue`);
  return e;
};

test('a guess reports overlap with the answer', () => {
  // SQUAT and DEADLIFT both hit glutes; only SQUAT leads with quads.
  const { shared, missed } = accumulateMuscleFeedback(['SQUAT'], ex('DEADLIFT'));
  assert.ok(shared.has('glutes'), 'glutes are common to both');
  assert.ok(shared.has('hamstrings'));
  assert.ok(missed.has('abs'), 'squat braces the abs, the deadlift entry does not list them');
  assert.ok(!shared.has('traps'), 'traps are in DEADLIFT but SQUAT never probed them');
});

test('shared and missed are always disjoint', () => {
  const { shared, missed } = accumulateMuscleFeedback(
    ['SQUAT', 'PLANK', 'PUSHUP'],
    ex('DEADLIFT'),
  );
  for (const r of shared) assert.ok(!missed.has(r), `${r} is in both sets`);
});

test('the answer’s unprobed muscles stay dark', () => {
  // This is the whole design: the figure narrows the space, it does not hand
  // over the category. PLANK never touches the traps, so DEADLIFT's traps must
  // remain unknown.
  const target = ex('DEADLIFT');
  const { shared, missed } = accumulateMuscleFeedback(['PLANK'], target);
  assert.ok(musclesOf(target).has('traps'));
  assert.ok(!shared.has('traps'));
  assert.ok(!missed.has('traps'));
});

test('feedback accumulates across guesses and never downgrades', () => {
  const target = ex('DEADLIFT');
  const one = accumulateMuscleFeedback(['PLANK'], target);
  const two = accumulateMuscleFeedback(['PLANK', 'SQUAT'], target);
  for (const r of one.shared) {
    assert.ok(two.shared.has(r), `${r} was shared after guess 1 but not after guess 2`);
  }
  assert.ok(two.shared.size >= one.shared.size);
});

test('guessing the answer itself lights its whole map and nothing else', () => {
  const target = ex('PUSHUP');
  const { shared, missed } = accumulateMuscleFeedback(['PUSHUP'], target);
  assert.deepEqual(
    [...shared].sort(),
    [...musclesOf(target)].sort() as MuscleRegion[],
  );
  assert.equal(missed.size, 0);
  assert.equal(discoveryRatio(shared, target), 1);
});

test('no guesses means no information', () => {
  const { shared, missed } = accumulateMuscleFeedback([], ex('SQUAT'));
  assert.equal(shared.size, 0);
  assert.equal(missed.size, 0);
});

test('unknown guess names are ignored rather than throwing', () => {
  const { shared } = accumulateMuscleFeedback(['NOTREAL', 'SQUAT'], ex('LUNGE'));
  assert.ok(shared.has('quads'));
});

test('two exercises for different groups produce clearly different feedback', () => {
  // If the muscle channel is to carry real information, PUSHUP and SQUAT must
  // not look alike against the same answer.
  const target = ex('BENTROW');
  const a = accumulateMuscleFeedback(['PUSHUP'], target);
  const b = accumulateMuscleFeedback(['SQUAT'], target);
  assert.notDeepEqual([...a.shared].sort(), [...b.shared].sort());
});
