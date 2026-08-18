import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE, exercisesOfLength } from '@/data/exercises';
import { evaluateGuess } from '@/lib/evaluate';
import { answerFor, playGuesses } from '@/server/game';
import { ANSWER_ORDER } from '@/server/answers';

const answerNames = new Set(ANSWER_ORDER);
const answers = CATALOGUE.filter((e) => answerNames.has(e.name));

/* ── the leak that made this necessary ────────────────────────────────────── */

test('the client cannot tell which words are answers', () => {
  /*
   * This is the fix, and it is worth stating why.
   *
   * With `isAnswer` public, a player could restrict candidates to the 12
   * answers of today's length: ~3.6 bits of entropy against a scored guess
   * worth up to 7.9. Measured over the whole pool, ONE optimal opener
   * identified the answer for 60 of 60 answers. The game was solvable in two.
   */
  for (const e of CATALOGUE) {
    assert.ok(!('isAnswer' in e), `${e.name} still carries an isAnswer flag`);
  }
});

test('hiding the pool measurably widens the candidate space', () => {
  // Not proof against a determined solver, but it removes the free shortcut:
  // every same-length word is now a live possibility.
  for (const L of [5, 6, 7, 8, 9]) {
    const visible = exercisesOfLength(L).length;
    const actual = answers.filter((a) => a.name.length === L).length;
    assert.ok(
      visible > actual,
      `length ${L}: client sees ${visible}, answer pool is ${actual} - no widening`,
    );
  }
});

/* ── the call ─────────────────────────────────────────────────────────────── */

const seed = 20260805;
const answer = answerFor(seed);

test('no call leaves the ordinary hint schedule intact', () => {
  const none = playGuesses(seed, [], answer);
  assert.equal(none.call, null);
  assert.equal(none.hints.category, null);
  assert.equal(none.hints.equipment, null);
  assert.equal(none.hints.nextHintIn, 2, 'category still two guesses away');
});

test('a correct call unlocks equipment immediately', () => {
  const right = playGuesses(seed, [], answer, answer.group);
  assert.deepEqual(right.call, { group: answer.group, correct: true });
  assert.equal(right.hints.equipment, answer.equipment, 'the reward is real');
});

test('a wrong call forfeits the category hint for the whole round', () => {
  const wrong = answer.group === 'Legs' ? 'Chest' : 'Legs';

  // Through every guess a live round can have.
  for (let n = 0; n < 5; n++) {
    const guesses = exercisesOfLength(answer.name.length)
      .filter((e) => e.name !== answer.name)
      .slice(0, n)
      .map((e) => e.name);
    const out = playGuesses(seed, guesses, answer, wrong);
    assert.equal(out.hints.category, null, `category leaked at guess ${n}`);
    assert.equal(out.hints.nextHintIn, null, 'nothing to count down to any more');
  }
});

test('the forfeit lifts once the round is over', () => {
  // Losing the hint must not also hide the answer on the result screen.
  const wrong = answer.group === 'Legs' ? 'Chest' : 'Legs';
  const out = playGuesses(seed, [answer.name], answer, wrong);
  assert.equal(out.status, 'won');
  assert.equal(out.hints.category, answer.group);
  assert.ok(out.reveal);
});

test('a call never reveals the answer itself', () => {
  // The whole mechanic is worthless if calling correctly hands over the word.
  const right = playGuesses(seed, [], answer, answer.group);
  assert.equal(right.reveal, null, 'reveal must wait for the round to end');
  assert.deepEqual(right.guesses, []);
});

test('calling is a genuine risk, not a free hint', () => {
  /*
   * Seven groups, so a blind guess is right about one time in seven. The
   * expected value has to be near-neutral or it stops being a decision:
   * always-call would be correct and the mechanic would be a formality.
   */
  const groups = new Set(answers.map((a) => a.group));
  assert.ok(groups.size >= 6, `only ${groups.size} groups in play`);

  const spread = [...groups].map((g) => answers.filter((a) => a.group === g).length);
  const commonest = Math.max(...spread) / answers.length;
  assert.ok(
    commonest < 0.5,
    `one group covers ${(commonest * 100).toFixed(0)}% of answers - calling it blind would be too safe`,
  );
});

test('scoring is unchanged by the call', () => {
  // The call moves hints only. Letter feedback must be identical either way.
  const guesses = [exercisesOfLength(answer.name.length)[0].name];
  const a = playGuesses(seed, guesses, answer);
  const b = playGuesses(seed, guesses, answer, answer.group);
  assert.deepEqual(a.evaluations, b.evaluations);
  assert.deepEqual(a.muscles, b.muscles);
  assert.deepEqual(a.evaluations[0], evaluateGuess(guesses[0], answer.name));
});
