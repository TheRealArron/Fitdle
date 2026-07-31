import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSaves } from '@/lib/cloudSync';
import { defaultSave, type SaveData } from '@/lib/secureStorage';

const make = (o: Partial<SaveData>): SaveData => ({ ...defaultSave(), ...o });

test('merging with an empty save keeps the played one', () => {
  const played = make({
    played: 3, wins: 2, streak: 2, maxStreak: 2,
    distribution: [0, 1, 1, 0, 0, 0], lastSeed: 20260730, lastResult: 'won', highSeed: 20260730,
  });
  const merged = mergeSaves(played, defaultSave());
  assert.equal(merged.played, 3);
  assert.equal(merged.streak, 2);
});

test('merge is order-independent', () => {
  const a = make({ played: 5, wins: 4, streak: 1, maxStreak: 4, distribution: [1, 1, 1, 1, 0, 0], lastSeed: 20260728, lastResult: 'won', highSeed: 20260728 });
  const b = make({ played: 3, wins: 3, streak: 3, maxStreak: 3, distribution: [0, 2, 1, 0, 0, 0], lastSeed: 20260730, lastResult: 'won', highSeed: 20260730 });
  assert.deepEqual(mergeSaves(a, b), mergeSaves(b, a));
});

test('counters never go backwards', () => {
  const a = make({ played: 10, wins: 6, streak: 1, maxStreak: 6, distribution: [1, 1, 1, 1, 1, 1], lastSeed: 20260730, lastResult: 'won', highSeed: 20260730 });
  const b = make({ played: 2, wins: 1, streak: 1, maxStreak: 1, distribution: [1, 0, 0, 0, 0, 0], lastSeed: 20260720, lastResult: 'won', highSeed: 20260720 });
  const m = mergeSaves(a, b);
  assert.equal(m.played, 10);
  assert.ok(m.wins >= 6);
  assert.equal(m.maxStreak, 6);
});

test('the clock-rollback high-water mark never regresses through sync', () => {
  // Otherwise a device with a wound-back clock could launder a lower highSeed
  // back onto an honest device and re-enable farming past puzzles.
  const honest = make({ highSeed: 20260730, lastSeed: 20260730, played: 1, wins: 1, streak: 1, maxStreak: 1, distribution: [1, 0, 0, 0, 0, 0], lastResult: 'won' });
  const rolledBack = make({ highSeed: 20260701, lastSeed: 20260701, played: 1, wins: 1, streak: 1, maxStreak: 1, distribution: [1, 0, 0, 0, 0, 0], lastResult: 'won' });
  assert.equal(mergeSaves(honest, rolledBack).highSeed, 20260730);
  assert.equal(mergeSaves(rolledBack, honest).highSeed, 20260730);
});

test('the streak comes from the more recently played save, not the bigger one', () => {
  // A stale device holding a long dead streak must not resurrect it.
  const stale = make({ played: 9, wins: 9, streak: 9, maxStreak: 9, distribution: [9, 0, 0, 0, 0, 0], lastSeed: 20260610, lastResult: 'won', highSeed: 20260610 });
  const recent = make({ played: 10, wins: 9, streak: 0, maxStreak: 9, distribution: [9, 0, 0, 0, 0, 0], lastSeed: 20260730, lastResult: 'lost', highSeed: 20260730 });
  const m = mergeSaves(stale, recent);
  assert.equal(m.streak, 0, 'the broken streak wins because it is current');
  assert.equal(m.maxStreak, 9, 'but the record of it survives');
});

test('the merged save stays internally coherent', () => {
  // The same invariants isCoherent enforces — a merge that violates them would
  // be rejected on the next load and silently wipe the player.
  const a = make({ played: 7, wins: 5, streak: 2, maxStreak: 5, distribution: [2, 1, 1, 1, 0, 0], lastSeed: 20260729, lastResult: 'won', highSeed: 20260729 });
  const b = make({ played: 4, wins: 4, streak: 4, maxStreak: 4, distribution: [1, 1, 1, 1, 0, 0], lastSeed: 20260730, lastResult: 'won', highSeed: 20260730 });
  const m = mergeSaves(a, b);
  assert.ok(m.wins <= m.played, 'wins cannot exceed played');
  assert.ok(m.streak <= m.wins, 'streak cannot exceed wins');
  assert.ok(m.maxStreak >= m.streak);
  assert.equal(m.distribution.reduce((s, n) => s + n, 0), m.wins, 'distribution must sum to wins');
  assert.equal(m.distribution.length, 6);
});

test('the in-progress board comes from the more recent day', () => {
  const laptop = make({ day: { seed: 20260730, guesses: ['SQUAT', 'PLANK'], status: 'playing' } });
  const phone = make({ day: { seed: 20260729, guesses: ['LUNGE'], status: 'won' } });
  assert.deepEqual(mergeSaves(laptop, phone).day?.guesses, ['SQUAT', 'PLANK']);
  assert.deepEqual(mergeSaves(phone, laptop).day?.guesses, ['SQUAT', 'PLANK']);
});
