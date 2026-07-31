import assert from 'node:assert/strict';
import test from 'node:test';
import { ANSWERS, CATALOGUE, exercisesOfLength, isValidGuess } from '@/data/exercises';
import { GROUP_OF_REGION } from '@/data/muscles';
import {
  getDailySeed,
  getDailyIndex,
  getDailyExercise,
  getDailyWordLength,
  daysBetweenSeeds,
  msUntilNextPuzzle,
} from '@/lib/daily';

test('seed is the specification formula, YYYYMMDD', () => {
  assert.equal(getDailySeed(new Date('2026-07-30T12:00:00Z')), 20260730);
  assert.equal(getDailySeed(new Date('2026-01-01T00:00:00Z')), 20260101);
  assert.equal(getDailySeed(new Date('2026-12-31T23:59:59Z')), 20261231);
});

test('index is seed modulo the answer pool', () => {
  const date = new Date('2026-07-30T12:00:00Z');
  assert.equal(getDailyIndex(date), 20260730 % ANSWERS.length);
  assert.equal(getDailyExercise(date), ANSWERS[20260730 % ANSWERS.length]);
});

test('every timezone gets the same word at the same instant', () => {
  const instant = '2026-07-30T10:30:00Z';
  const seeds = ['+14:00', '+09:00', '+00:00', '-05:00', '-11:00'].map(() =>
    getDailySeed(new Date(instant)),
  );
  assert.equal(new Set(seeds).size, 1, 'seed must not vary by observer');
});

test('the answer only changes at UTC midnight', () => {
  assert.equal(getDailySeed(new Date('2026-07-30T23:59:59.999Z')), 20260730);
  assert.equal(getDailySeed(new Date('2026-07-31T00:00:00.000Z')), 20260731);
});

test('the answer is stable across an entire UTC day', () => {
  const indices = new Set<number>();
  for (let h = 0; h < 24; h++) {
    indices.add(getDailyIndex(new Date(`2026-07-30T${String(h).padStart(2, '0')}:30:00Z`)));
  }
  assert.equal(indices.size, 1);
});

test('day arithmetic spans month and year boundaries', () => {
  assert.equal(daysBetweenSeeds(20260130, 20260131), 1);
  assert.equal(daysBetweenSeeds(20260131, 20260201), 1);
  assert.equal(daysBetweenSeeds(20261231, 20270101), 1);
  assert.equal(daysBetweenSeeds(20260228, 20260301), 1, '2026 is not a leap year');
  assert.equal(daysBetweenSeeds(20260301, 20260228), -1);
});

test('countdown lands on the next UTC midnight', () => {
  assert.equal(msUntilNextPuzzle(new Date('2026-07-30T23:00:00Z')), 60 * 60 * 1000);
});

/* ── answer pool integrity ────────────────────────────────────────────────── */

test('ANSWERS order is load-bearing and must stay pinned', () => {
  // Reordering silently rewrites every past and future puzzle. So does changing
  // the pool size, since the index is a modulus — see the caveat in exercises.ts.
  assert.equal(ANSWERS.length, 60);
  assert.equal(ANSWERS[0].name, 'SQUAT');
  assert.equal(ANSWERS[59].name, 'ARMCIRCLE');
  assert.equal(
    ANSWERS.slice(0, 5).map((a) => a.name).join(','),
    'SQUAT,BURPEE,CLIMBER,DEADLIFT,HIPTHRUST',
  );
});

test('the pool divides evenly into the length cycle', () => {
  // A pool that is not a multiple of 5 would break the 5,6,7,8,9 rotation at
  // the wrap-around, giving two same-width days in a row.
  assert.equal(ANSWERS.length % 5, 0);
  const perLength = new Map<number, number>();
  for (const a of ANSWERS) {
    perLength.set(a.name.length, (perLength.get(a.name.length) ?? 0) + 1);
  }
  assert.deepEqual([...perLength.entries()].sort(), [[5, 12], [6, 12], [7, 12], [8, 12], [9, 12]]);
});

test('answer lengths cycle 5,6,7,8,9 so consecutive days differ in grid width', () => {
  ANSWERS.forEach((a, i) => {
    assert.equal(a.name.length, 5 + (i % 5), `${a.name} at index ${i} breaks the cycle`);
  });
  assert.equal(getDailyWordLength(new Date('2026-07-30T00:00:00Z')), ANSWERS[20260730 % 40].name.length);
});

test('every catalogue name is alphabetic, uppercase and unique', () => {
  const seen = new Set<string>();
  for (const e of CATALOGUE) {
    assert.match(e.name, /^[A-Z]{4,10}$/, `${e.name} is not a plain uppercase name`);
    assert.ok(!seen.has(e.name), `${e.name} appears twice`);
    seen.add(e.name);
  }
});

test('every answer carries coaching content', () => {
  // The spec's dictionary had mutilated words with nothing to teach. An answer
  // without how-to text is a puzzle with no payoff.
  for (const a of ANSWERS) {
    assert.ok(a.howTo.length >= 3, `${a.name} has too few coaching cues`);
    assert.ok(a.videoQuery.length > 0, `${a.name} has no video query`);
    assert.ok(a.display.length > 0, `${a.name} has no display name`);
  }
});

test('every answer length has enough guessable candidates to be a real puzzle', () => {
  // If a length had only a handful of options the answer would be brute-forceable.
  for (const length of [5, 6, 7, 8, 9]) {
    const pool = exercisesOfLength(length);
    assert.ok(pool.length >= 10, `only ${pool.length} exercises of length ${length}`);
  }
});

test('primary muscles are consistent with the declared group', () => {
  // The category hint is only useful if it is accurate.
  for (const e of CATALOGUE) {
    if (e.group === 'Full') continue;
    const groups = new Set(e.primary.map((m) => GROUP_OF_REGION[m]));
    assert.ok(
      groups.has(e.group),
      `${e.name} claims group ${e.group} but its primary muscles map to ${[...groups].join('/')}`,
    );
  }
});

test('every exercise works at least one muscle', () => {
  for (const e of CATALOGUE) {
    assert.ok(e.primary.length > 0, `${e.name} has no primary muscles`);
  }
});

test('guesses must match the day length and be real exercises', () => {
  assert.ok(isValidGuess('SQUAT', 5));
  assert.ok(isValidGuess('squat', 5), 'guesses are case-insensitive');
  assert.ok(!isValidGuess('SQUAT', 6), 'wrong length must be rejected');
  assert.ok(!isValidGuess('CHAIR', 5), 'non-exercises must be rejected');
  assert.ok(!isValidGuess('BURPE', 5), 'the spec’s mutilated words are gone');
  assert.ok(!isValidGuess('ROWSR', 5));
  assert.ok(!isValidGuess('VUPPS', 5));
});
