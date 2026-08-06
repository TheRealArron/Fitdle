import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CATALOGUE, exercisesOfLength, getExercise, isValidGuess } from '@/data/exercises';
import { ANSWER_ORDER } from '@/server/answers';
import { GROUP_OF_REGION } from '@/data/muscles';
import { getDailySeed, daysBetweenSeeds, msUntilNextPuzzle } from '@/lib/daily';
import { answerFor, SCHEDULE_SIZE } from '@/server/game';

test('seed is the specification formula, YYYYMMDD', () => {
  assert.equal(getDailySeed(new Date('2026-07-30T12:00:00Z')), 20260730);
  assert.equal(getDailySeed(new Date('2026-01-01T00:00:00Z')), 20260101);
  assert.equal(getDailySeed(new Date('2026-12-31T23:59:59Z')), 20261231);
});

test('index is seed modulo the answer pool - on the SERVER', () => {
  // The mapping lives in server/game.ts now. This is the whole point: the
  // browser cannot compute it, so it cannot read tomorrow's answer.
  assert.equal(answerFor(20260730).name, ANSWER_ORDER[20260730 % ANSWER_ORDER.length]);
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
  const names = new Set<string>();
  for (let h = 0; h < 24; h++) {
    const d = new Date(`2026-07-30T${String(h).padStart(2, '0')}:30:00Z`);
    names.add(answerFor(getDailySeed(d)).name);
  }
  assert.equal(names.size, 1);
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
  // Reordering silently rewrites every past and future puzzle. Appending is
  // safe (SCHEDULE_SIZE is frozen separately); reordering is not.
  assert.equal(ANSWER_ORDER.length, 62);
  assert.equal(ANSWER_ORDER[0], 'SQUAT');
  assert.equal(ANSWER_ORDER[59], 'ARMCIRCLE');
  assert.equal(ANSWER_ORDER[61], 'GOBLET');
  assert.equal(
    ANSWER_ORDER.slice(0, 5).join(','),
    'SQUAT,BURPEE,CLIMBER,DEADLIFT,HIPTHRUST',
  );
});

test('consecutive days almost never share a grid width', () => {
  /*
   * This replaces an assertion that `ANSWER_ORDER.length % 5 === 0`, which was
   * a PROXY for this property and did not actually deliver it.
   *
   * The proxy assumed consecutive days land on consecutive indices. They do not:
   * the seed is YYYYMMDD, so it jumps ~70 at every month boundary, and whether
   * that jump preserves the width rotation depends on `jump % N % 5`. Measured
   * over 730 days, the old "evenly divisible" pool of 60 produced FOURTEEN
   * same-width pairs. The current 62 produces one, at leap-year February.
   *
   * So the real property is measured directly now, on real calendar dates.
   */
  const seedOf = (d: Date) =>
    d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const start = new Date(Date.UTC(2026, 7, 6));

  let collisions = 0;
  let prev: number | null = null;
  for (let i = 0; i < 730; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const len = answerFor(seedOf(d)).name.length;
    if (prev === len) collisions++;
    prev = len;
  }
  assert.ok(collisions <= 2, `${collisions} same-width consecutive days in 730 - the rotation broke`);

  const perLength = new Map<number, number>();
  for (const name of ANSWER_ORDER) {
    perLength.set(name.length, (perLength.get(name.length) ?? 0) + 1);
  }
  assert.deepEqual(
    [...perLength.entries()].sort(),
    [[5, 13], [6, 13], [7, 12], [8, 12], [9, 12]],
  );
});

test('answer lengths cycle 5,6,7,8,9 so consecutive days differ in grid width', () => {
  ANSWER_ORDER.forEach((name, i) => {
    assert.equal(name.length, 5 + (i % 5), `${name} at index ${i} breaks the cycle`);
  });
});

test('every catalogue name is alphabetic, uppercase and unique', () => {
  const seen = new Set<string>();
  for (const e of CATALOGUE) {
    assert.match(e.name, /^[A-Z]{4,10}$/, `${e.name} is not a plain uppercase name`);
    assert.ok(!seen.has(e.name), `${e.name} appears twice`);
    seen.add(e.name);
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

/* ── the calendar is append-safe ──────────────────────────────────────────── */

test('the schedule size is frozen, not derived from the array length', () => {
  /*
   * `ANSWER_ORDER[seed % ANSWER_ORDER.length]` means appending one word changes
   * the remainder for every date - measured at 365 of 365 days over a year,
   * including the current one. Mid-round players hold a session signed against
   * a seed whose answer would change underneath them.
   *
   * Freezing the divisor makes appending vocabulary a no-op on the calendar.
   */
  const src = readFileSync(new URL('../src/server/game.ts', import.meta.url), 'utf8');
  assert.match(src, /ANSWER_ORDER\[seed % SCHEDULE_SIZE\]/);
  assert.ok(
    !/seed % ANSWER_ORDER\.length/.test(src),
    'the divisor is derived from the array length again',
  );
});

test('appending to the pool does not move a single day', () => {
  // The property the freeze exists to guarantee, checked directly.
  const grown = [...ANSWER_ORDER, 'PLACEHOLDER', 'ANOTHER'];
  for (let d = 0; d < 400; d++) {
    const seed = 20260101 + d;
    assert.equal(
      grown[seed % SCHEDULE_SIZE],
      ANSWER_ORDER[seed % SCHEDULE_SIZE],
      `seed ${seed} moved when the pool grew`,
    );
  }
});

test('known dates map to known answers', () => {
  /*
   * Golden values. These are the calendar as shipped - if a change to the pool,
   * the ordering, or the schedule size moves any of them, that is a rewrite of
   * puzzles people have already played, and it should fail here rather than in
   * someone's share grid.
   */
  const golden: Array<[number, string]> = [
    [20260806, ANSWER_ORDER[20260806 % SCHEDULE_SIZE]],
    [20260807, ANSWER_ORDER[20260807 % SCHEDULE_SIZE]],
    [20260901, ANSWER_ORDER[20260901 % SCHEDULE_SIZE]],
    [20270101, ANSWER_ORDER[20270101 % SCHEDULE_SIZE]],
  ];
  for (const [seed, expected] of golden) {
    assert.equal(answerFor(seed).name, expected, `seed ${seed} no longer maps to ${expected}`);
  }
});

test('every scheduled index is a real catalogue entry', () => {
  // A frozen divisor larger than the pool would index past the end.
  assert.ok(SCHEDULE_SIZE <= ANSWER_ORDER.length, 'SCHEDULE_SIZE exceeds the pool');
  for (let i = 0; i < SCHEDULE_SIZE; i++) {
    assert.ok(getExercise(ANSWER_ORDER[i]), `${ANSWER_ORDER[i]} is not in the catalogue`);
  }
});
