import assert from 'node:assert/strict';
import test from 'node:test';
import { digest, defaultSave, reconcile, commitResult, type SaveData } from '@/lib/secureStorage';

/* ── digest ───────────────────────────────────────────────────────────────── */

test('digest is 128 bits of hex', () => {
  assert.match(digest('hello'), /^[0-9a-f]{32}$/);
});

test('digest is deterministic', () => {
  assert.equal(digest('{"streak":3}'), digest('{"streak":3}'));
});

test('a single-character edit changes the digest', () => {
  assert.notEqual(digest('{"streak":3}'), digest('{"streak":4}'));
  assert.notEqual(digest('{"streak":3}'), digest('{"streak":30}'));
});

test('the key domain-separates', () => {
  assert.notEqual(digest('payload', 'key-a'), digest('payload', 'key-b'));
});

test('length is folded in, so truncation and extension are detected', () => {
  const full = '{"streak":7,"maxStreak":9}';
  assert.notEqual(digest(full), digest(full.slice(0, -1)), 'truncation undetected');
  assert.notEqual(digest(full), digest(`${full} `), 'extension undetected');
  assert.notEqual(digest(''), digest(' '));
  // Repeated characters are a classic weak spot for rolling hashes.
  assert.notEqual(digest('aa'), digest('aaa'));
  assert.notEqual(digest('a'.repeat(64)), digest('a'.repeat(65)));
});

test('digest avalanches — flipping one bit changes most of the output', () => {
  const a = digest('streak:10');
  const b = digest('streak:11');
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  assert.ok(same < 12, `too similar: ${a} vs ${b} (${same}/32 nibbles shared)`);
});

test('the specification digest would have collided; this one does not', () => {
  // The spec's hash was `(a << 5) - a + charCode` folded to 32 bits and
  // rendered as short hex. Distinct short streak strings must stay distinct.
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(digest(String(i)));
  assert.equal(seen.size, 5000, 'digest collided on small integers');
});

/* ── anti-replay ──────────────────────────────────────────────────────────── */

test('a puzzle can only pay out once', () => {
  let save = defaultSave();
  save = commitResult(save, 20260730, true, 3, true);
  assert.equal(save.streak, 1);
  assert.equal(save.played, 1);

  // The exact spec exploit: win, reload, win again.
  save = commitResult(save, 20260730, true, 3, true);
  assert.equal(save.streak, 1, 'replaying the same puzzle inflated the streak');
  assert.equal(save.played, 1);
  assert.equal(save.wins, 1);
});

test('consecutive days build a streak', () => {
  let save = defaultSave();
  for (const seed of [20260728, 20260729, 20260730]) {
    save = reconcile(save, seed).save;
    save = commitResult(save, seed, true, 4, true);
  }
  assert.equal(save.streak, 3);
  assert.equal(save.maxStreak, 3);
});

test('a missed day breaks the streak', () => {
  let save = defaultSave();
  save = commitResult(save, 20260728, true, 2, true);
  assert.equal(save.streak, 1);

  // 29th skipped entirely.
  const r = reconcile(save, 20260730);
  assert.equal(r.save.streak, 0);
  assert.equal(r.streakBroken, true);
});

test('a loss breaks the streak', () => {
  let save = defaultSave();
  save = commitResult(save, 20260729, true, 2, true);
  save = reconcile(save, 20260730).save;
  save = commitResult(save, 20260730, false, 6, true);
  assert.equal(save.streak, 0);
  assert.equal(save.maxStreak, 1, 'max streak must survive a loss');
});

/* ── clock tampering ──────────────────────────────────────────────────────── */

test('winding the clock back is detected', () => {
  let save = defaultSave();
  save = reconcile(save, 20260730).save;
  save = commitResult(save, 20260730, true, 3, true);

  const r = reconcile(save, 20260715);
  assert.equal(r.clockRollback, true);
  assert.equal(r.save.highSeed, 20260730, 'high-water mark must not regress');
});

test('rolled-back days earn no streak credit', () => {
  let save = defaultSave();
  save = reconcile(save, 20260730).save;
  save = commitResult(save, 20260730, true, 3, true);
  assert.equal(save.streak, 1);

  const r = reconcile(save, 20260715);
  // Streak credit is withheld while the clock looks rolled back.
  const after = commitResult(r.save, 20260715, true, 3, !r.clockRollback);
  assert.equal(after.streak, 1, 'farming past puzzles inflated the streak');
});

test('normal forward play advances the high-water mark', () => {
  let save = defaultSave();
  save = reconcile(save, 20260728).save;
  assert.equal(save.highSeed, 20260728);
  save = reconcile(save, 20260729).save;
  assert.equal(save.highSeed, 20260729);
});

/* ── day restoration ──────────────────────────────────────────────────────── */

test('an in-progress board is restored, not wiped', () => {
  const save: SaveData = {
    ...defaultSave(),
    day: { seed: 20260730, guesses: ['SQUAT', 'PLANK'], status: 'playing' },
  };
  const r = reconcile(save, 20260730);
  assert.deepEqual(r.day.guesses, ['SQUAT', 'PLANK']);
  assert.equal(r.alreadyComplete, false);
});

test('yesterday’s board does not leak into today', () => {
  const save: SaveData = {
    ...defaultSave(),
    day: { seed: 20260729, guesses: ['SQUAT'], status: 'playing' },
  };
  const r = reconcile(save, 20260730);
  assert.deepEqual(r.day.guesses, []);
  assert.equal(r.day.seed, 20260730);
});

test('a finished day stays finished across a reload', () => {
  const save: SaveData = {
    ...defaultSave(),
    lastSeed: 20260730,
    lastResult: 'won',
    day: { seed: 20260730, guesses: ['PLANK', 'SQUAT'], status: 'won' },
  };
  const r = reconcile(save, 20260730);
  assert.equal(r.alreadyComplete, true);
  assert.equal(r.day.status, 'won');
});

test('day records survive a round trip at every answer length', () => {
  // Regression: `isCoherent` hardcoded /^[A-Z]{5}$/ after answers became
  // variable-length. Every save on a 6–9 letter day failed validation, was
  // treated as tampering, and silently wiped the player's streak.
  for (const word of ['SQUAT', 'BURPEE', 'ARMCURL', 'DEADLIFT', 'BEARCRAWL']) {
    const save: SaveData = {
      ...defaultSave(),
      day: { seed: 20260730, guesses: [word], status: 'playing' },
    };
    const r = reconcile(save, 20260730);
    assert.deepEqual(r.day.guesses, [word], `${word} (${word.length} letters) was rejected`);
  }
});

test('reconcile does not mutate its input', () => {
  const save = defaultSave();
  const before = JSON.stringify(save);
  reconcile(save, 20260730);
  assert.equal(JSON.stringify(save), before);
});

/* ── stats coherence ──────────────────────────────────────────────────────── */

test('the guess distribution always sums to the win count', () => {
  let save = defaultSave();
  const script: Array<[number, boolean, number]> = [
    [20260720, true, 1],
    [20260721, true, 6],
    [20260722, false, 6],
    [20260723, true, 3],
  ];
  for (const [seed, won, count] of script) {
    save = reconcile(save, seed).save;
    save = commitResult(save, seed, won, count, true);
  }
  assert.equal(save.played, 4);
  assert.equal(save.wins, 3);
  assert.equal(
    save.distribution.reduce((a, b) => a + b, 0),
    save.wins,
  );
  assert.ok(save.streak <= save.wins);
  assert.ok(save.maxStreak >= save.streak);
});
