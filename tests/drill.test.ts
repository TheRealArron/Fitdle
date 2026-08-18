import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE, musclesOf } from '@/data/exercises';
import { GROUP_OF_REGION } from '@/data/muscles';
import { OPTION_COUNT, badgeFor, isFlawless, makeQuestion, makeRound } from '@/lib/drill';
import { commitDrill, defaultSave, normalise, type SaveData } from '@/lib/secureStorage';
import { mergeSaves } from '@/lib/cloudSync';
import { buildShareText } from '@/lib/share';

/** Deterministic source so a failure is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── question fairness ────────────────────────────────────────────────────── */

test('no distractor is a muscle the exercise actually works', () => {
  /*
   * The fairness invariant, and the whole reason the generator is not a
   * one-liner. If a distractor is a muscle the exercise trains - even as a
   * secondary assistor - then the "wrong" answer is arguably right, and a quiz
   * you can lose by being correct teaches the opposite of what it should.
   */
  const rand = rng(7);
  for (const ex of CATALOGUE) {
    const q = makeQuestion(rand, ex);
    const worked = musclesOf(ex);
    for (const opt of q.options) {
      if (opt === q.answer) continue;
      assert.ok(
        !worked.has(opt),
        `${ex.name}: "${opt}" is offered as wrong but the exercise works it`,
      );
    }
  }
});

test('the answer is always a primary mover', () => {
  const rand = rng(11);
  for (const ex of CATALOGUE) {
    const q = makeQuestion(rand, ex);
    assert.ok(ex.primary.includes(q.answer), `${ex.name}: answer is not a primary mover`);
  }
});

test('every question offers exactly one correct option', () => {
  const rand = rng(13);
  for (const ex of CATALOGUE) {
    const q = makeQuestion(rand, ex);
    assert.equal(q.options.length, OPTION_COUNT);
    assert.equal(new Set(q.options).size, OPTION_COUNT, `${ex.name}: duplicate options`);
    assert.equal(q.options.filter((o) => o === q.answer).length, 1);
  }
});

test('distractors usually come from a different muscle group', () => {
  /*
   * Two options from the answer's own group turn the question into a coin flip
   * on wording rather than a test of anatomy. A handful of full-body movements
   * leave too little untouched to avoid it, so this asserts the common case
   * rather than demanding perfection.
   */
  const rand = rng(17);
  let sameGroup = 0;
  for (const ex of CATALOGUE) {
    const q = makeQuestion(rand, ex);
    const g = GROUP_OF_REGION[q.answer];
    if (q.options.some((o) => o !== q.answer && GROUP_OF_REGION[o] === g)) sameGroup++;
  }
  assert.ok(
    sameGroup / CATALOGUE.length < 0.2,
    `${sameGroup}/${CATALOGUE.length} questions had a same-group distractor`,
  );
});

test('the answer position is not predictable', () => {
  // An always-first answer is a free 100%.
  const rand = rng(23);
  const positions = [0, 0, 0];
  for (const ex of CATALOGUE) {
    const q = makeQuestion(rand, ex);
    positions[q.options.indexOf(q.answer)]++;
  }
  for (const n of positions) {
    assert.ok(n > CATALOGUE.length / 6, `answer position skewed: ${positions.join('/')}`);
  }
});

/* ── rounds ───────────────────────────────────────────────────────────────── */

test('a round does not repeat an exercise', () => {
  const round = makeRound(99, 40);
  assert.equal(new Set(round.map((q) => q.exercise.name)).size, round.length);
});

test('a round is long enough that nobody reaches the end', () => {
  // 30 seconds at a question a second still leaves headroom.
  assert.ok(makeRound(1).length >= 35);
});

test('the same seed produces the same round', () => {
  const a = makeRound(4242).map((q) => `${q.exercise.name}:${q.answer}`);
  const b = makeRound(4242).map((q) => `${q.exercise.name}:${q.answer}`);
  assert.deepEqual(a, b);
});

test('the drill draws from the whole catalogue, not the answer pool', () => {
  /*
   * It must NOT exclude today's answer. Excluding it would be a leak: an
   * observant player could diff the drill's vocabulary against the exercise
   * index and find the one word missing. Including everything reveals nothing,
   * because the client does not know which word is today's.
   */
  const seen = new Set(makeRound(5, 99).map((q) => q.exercise.name));
  assert.equal(seen.size, CATALOGUE.length, 'the drill pool is not the full catalogue');
});

/* ── scoring and persistence ──────────────────────────────────────────────── */

test('a personal best only goes up', () => {
  let save = defaultSave();
  save = commitDrill(save, 12);
  assert.equal(save.drillBest, 12);
  save = commitDrill(save, 4);
  assert.equal(save.drillBest, 12, 'a bad run lowered the record');
  save = commitDrill(save, 19);
  assert.equal(save.drillBest, 19);
});

test('a nonsense score cannot corrupt the record', () => {
  const save = commitDrill(commitDrill(defaultSave(), -5), 3.7);
  assert.equal(save.drillBest, 3);
});

test('an old save without a drill score loads rather than being rejected', () => {
  // The reason this is optional: bumping SAVE_VERSION would have failed every
  // existing save's coherence check and wiped real streaks.
  const legacy = { ...defaultSave() } as Partial<SaveData>;
  delete legacy.drillBest;
  assert.equal(normalise(legacy as SaveData).drillBest, 0);
});

test('the best survives a cloud merge', () => {
  const phone = { ...defaultSave(), drillBest: 17 };
  const laptop = { ...defaultSave(), drillBest: 6 };
  assert.equal(mergeSaves(phone, laptop).drillBest, 17);
  assert.equal(mergeSaves(laptop, phone).drillBest, 17);
});

/* ── badges and sharing ───────────────────────────────────────────────────── */

test('badges are ordered and reachable', () => {
  assert.equal(badgeFor(0), null);
  assert.equal(badgeFor(7), null);
  assert.equal(badgeFor(8)?.label, 'Warmed up');
  assert.equal(badgeFor(14)?.label, 'Sharp');
  assert.equal(badgeFor(25)?.label, 'Anatomist');
});

test('the drill badge never touches the comparable score line', () => {
  /*
   * The `n/6` line is what players compare with each other. Folding a
   * different mode's achievement into it would make two shares incomparable,
   * so the badge gets its own line or none at all.
   */
  const evals = [['correct', 'correct', 'correct', 'correct', 'correct']] as never;
  const plain = buildShareText(20260806, evals, true, 1, false, 0);
  const withBadge = buildShareText(20260806, evals, true, 1, false, 22);

  assert.equal(plain.split('\n')[0], withBadge.split('\n')[0], 'the score line changed');
  assert.ok(!plain.includes('🧠'));
  assert.ok(withBadge.includes('🧠') && withBadge.includes('Anatomist'));
});

test('a share with no drill history looks exactly as it did before', () => {
  const evals = [['correct', 'correct', 'correct', 'correct', 'correct']] as never;
  assert.ok(!buildShareText(20260806, evals, true, 3, false, 0).includes('anatomy'));
});

/* ── the flawless mark ────────────────────────────────────────────────────── */

test('flawless needs both volume and accuracy', () => {
  /*
   * Volume badges say you were fast. This one says you were never wrong, which
   * is the only claim that separates knowing the anatomy from guessing quickly.
   * One correct answer and no misses is not evidence of anything.
   */
  assert.equal(isFlawless(5, 0), true);
  assert.equal(isFlawless(9, 0), true);
  assert.equal(isFlawless(4, 0), false, 'too few answers to mean anything');
  assert.equal(isFlawless(9, 1), false, 'one miss is not flawless');
  assert.equal(isFlawless(0, 0), false);
});

test('the flawless mark is kept once earned', () => {
  // It records that you did it, not that you did it today.
  let save = commitDrill(defaultSave(), 7, true);
  assert.equal(save.drillFlawless, true);
  save = commitDrill(save, 12, false);
  assert.equal(save.drillFlawless, true, 'a later imperfect run revoked it');
});

test('the mark survives a cloud merge from either device', () => {
  const earned = { ...defaultSave(), drillFlawless: true };
  const not = { ...defaultSave(), drillFlawless: false };
  assert.equal(mergeSaves(earned, not).drillFlawless, true);
  assert.equal(mergeSaves(not, earned).drillFlawless, true);
});

test('an old save without the mark loads rather than being rejected', () => {
  const legacy = { ...defaultSave() } as Partial<SaveData>;
  delete legacy.drillFlawless;
  assert.equal(normalise(legacy as SaveData).drillFlawless, false);
});

test('the mark rides the share without touching the score line', () => {
  const evals = [['correct', 'correct', 'correct', 'correct', 'correct']] as never;
  const plain = buildShareText(20260806, evals, true, 1, false, 0, false);
  const marked = buildShareText(20260806, evals, true, 1, false, 0, true);

  assert.equal(plain.split('\n')[0], marked.split('\n')[0], 'the comparable score line changed');
  assert.ok(!plain.includes('🎓'));
  assert.ok(marked.includes('🎓'));
});
