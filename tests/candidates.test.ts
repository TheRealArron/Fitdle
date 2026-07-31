import assert from 'node:assert/strict';
import test from 'node:test';
import { ANSWERS } from '@/data/exercises';
import { evaluateGuess } from '@/lib/evaluate';
import { answersOfLength, possibleAnswers } from '@/lib/candidates';

const score = (guesses: string[], answer: string) =>
  guesses.map((g) => evaluateGuess(g, answer));

test('with no guesses, every answer of that length is possible', () => {
  const all = answersOfLength(5);
  assert.deepEqual(possibleAnswers([], [], 5), all);
  assert.equal(all.length, 12);
});

test('the true answer always survives its own feedback', () => {
  // If this ever fails the panel would tell a player their answer is impossible.
  for (const answer of ANSWERS) {
    const L = answer.name.length;
    const guesses = answersOfLength(L)
      .filter((a) => a.name !== answer.name)
      .slice(0, 3)
      .map((a) => a.name);
    const survivors = possibleAnswers(guesses, score(guesses, answer.name), L);
    assert.ok(
      survivors.some((s) => s.name === answer.name),
      `${answer.name} was eliminated by its own clues`,
    );
  }
});

test('guessing the answer narrows it to exactly one', () => {
  const answer = ANSWERS.find((a) => a.name === 'SQUAT')!;
  const survivors = possibleAnswers(['SQUAT'], score(['SQUAT'], 'SQUAT'), 5);
  assert.deepEqual(survivors.map((s) => s.name), [answer.name]);
});

test('an all-grey guess eliminates everything containing its letters', () => {
  const guesses = ['PLANK'];
  const survivors = possibleAnswers(guesses, score(guesses, 'SQUAT'), 5);
  for (const s of survivors) {
    // P, L, N and K were all absent, so no survivor may contain them.
    // (A appears in SQUAT, so it is not eliminated.)
    for (const ch of ['P', 'L', 'N', 'K']) {
      assert.ok(!s.name.includes(ch), `${s.name} kept eliminated letter ${ch}`);
    }
  }
  assert.ok(survivors.length < answersOfLength(5).length, 'nothing was narrowed');
});

test('candidates never include a different length', () => {
  for (const L of [5, 6, 7, 8, 9]) {
    for (const a of possibleAnswers([], [], L)) assert.equal(a.name.length, L);
  }
});

test('candidates are drawn from answers only, never guess-only entries', () => {
  // SQUATS and PLANKS are guessable but can never be the answer; offering them
  // as candidates would send players down a dead end.
  const names = new Set(possibleAnswers([], [], 6).map((a) => a.name));
  assert.ok(!names.has('SQUATS'));
  assert.ok(!names.has('PLANKS'));
  assert.ok(names.has('BURPEE'));
});

test('narrowing is monotonic — more clues never widen the field', () => {
  const answer = 'BURPEE';
  const guesses = ['CRUNCH', 'PUSHUP', 'PULLUP'];
  const evals = score(guesses, answer);
  let previous = Infinity;
  for (let n = 0; n <= guesses.length; n++) {
    const count = possibleAnswers(guesses.slice(0, n), evals.slice(0, n), 6).length;
    assert.ok(count <= previous, `guess ${n} widened the field: ${previous} -> ${count}`);
    previous = count;
  }
  assert.ok(previous >= 1, 'the real answer must always remain');
});
