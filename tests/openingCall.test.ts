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
   * With `isAnswer` public, a player could restrict candidates to the 12 or 13
   * answers of today's length: ~3.6 bits of entropy against a scored guess
   * worth up to 7.9. Measured over the whole pool, ONE optimal opener
   * identified the answer every time. The game was solvable in two.
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

/* ── the sweep ────────────────────────────────────────────────────────────── */

/*
 * These call the route handler, not a pure function.
 *
 * The tests above this line score a call that `playGuesses` is HANDED. They all
 * passed while `/api/call` gave out unlimited calls, because a function given
 * the call as an argument cannot see how many times it was asked. The exploit
 * lived entirely in the route, so the test has to live there too.
 *
 * Measured against a live server before the fix: six requests with no token
 * found the day's group and collected the equipment hint, with no forfeit.
 */

process.env.FITDLE_SESSION_SECRET ||= 'tests-only-not-a-real-secret-0000000000';

const { POST: callRoute } = await import('@/app/api/call/route');
const { dailySeed } = await import('@/server/game');
const { recordCall, resetCallRecords } = await import('@/server/callRecord');
const { GROUP_ORDER } = await import('@/data/muscles');

/** One call, from a named address, with no session token - the sweep's shape. */
async function call(group: string, address: string) {
  const res = await callRoute(
    new Request('http://localhost/api/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
      body: JSON.stringify({ group }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const todaysGroup = answerFor(dailySeed()).group;
const otherGroup = GROUP_ORDER.find((g) => g !== todaysGroup)!;

test('a second call from the same caller is refused, and reveals nothing', async () => {
  resetCallRecords();
  const first = await call(otherGroup, '198.51.100.10');
  assert.equal(first.status, 200, 'the first call must be accepted');
  assert.equal((first.body.call as { correct: boolean }).correct, false);

  // The sweep: throw the token away and try the next group.
  const second = await call(todaysGroup, '198.51.100.10');
  assert.equal(second.status, 409, 'a second group must be refused');
  assert.equal(second.body.call, undefined, 'a refusal must carry no outcome');
  assert.equal(second.body.hints, undefined, 'a refusal must carry no hints');
  assert.equal(second.body.called, otherGroup, 'and must name the call that stands');
});

test('sweeping every group finds nothing after the first request', async () => {
  resetCallRecords();
  const seen = [];
  for (const group of GROUP_ORDER) {
    const { status, body } = await call(group, '198.51.100.11');
    if (status === 200) seen.push((body.call as { correct: boolean }).correct);
  }
  assert.equal(seen.length, 1, `the sweep got ${seen.length} outcomes; it must get exactly one`);
});

test('calling the same group again replays your own outcome', async () => {
  /*
   * The honest case this has to keep working: a player calls, then loses the
   * token - cleared storage, a new tab, a dead phone. Refusing them would cost
   * a call they already paid for, so the same group is idempotent rather than
   * rejected.
   */
  resetCallRecords();
  const first = await call(todaysGroup, '198.51.100.12');
  const again = await call(todaysGroup, '198.51.100.12');
  assert.equal(again.status, 200, 'the same group must be replayable');
  assert.deepEqual(again.body.call, first.body.call, 'and must replay the same outcome');
  assert.deepEqual(again.body.hints, first.body.hints);
});

test('one caller cannot spend another caller’s call', async () => {
  /*
   * The two must ask for DIFFERENT groups. With the same group a record keyed
   * by nothing at all still replays a 200 for the second caller, so the test
   * would pass with the key removed - which is exactly what it failed to catch
   * the first time it was written.
   */
  resetCallRecords();
  const a = await call(otherGroup, '198.51.100.13');
  const b = await call(todaysGroup, '198.51.100.14');
  assert.equal(a.status, 200);
  assert.equal(b.status, 200, 'a different caller must still get their own first call');
  assert.equal(
    (b.body.call as { correct: boolean }).correct,
    true,
    'and must get the outcome for the group THEY asked about',
  );
});

test('the record is per day, so tomorrow is a fresh call', async () => {
  resetCallRecords();
  const seed = dailySeed();
  assert.equal(await recordCall('ip:203.0.113.1', seed, 'Legs'), 'Legs');
  assert.equal(await recordCall('ip:203.0.113.1', seed, 'Chest'), 'Legs', 'same day, first wins');
  assert.equal(
    await recordCall('ip:203.0.113.1', seed + 1, 'Chest'),
    'Chest',
    'a new seed must not inherit yesterday’s call',
  );
});
