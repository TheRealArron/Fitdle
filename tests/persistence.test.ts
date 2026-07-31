import assert from 'node:assert/strict';
import test from 'node:test';
import { digest, defaultSave, type SaveData } from '@/lib/secureStorage';

/**
 * `loadSave`/`writeSave` need localStorage, which Node has no business
 * providing. These drive the same envelope format against a stub so the
 * validation path — the part that silently wiped streaks — is covered without a
 * browser.
 */
function envelope(save: SaveData): string {
  const canonical = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  };
  const p = canonical(save);
  return JSON.stringify({ p, h: digest(p) });
}

async function withStorage<T>(fn: () => Promise<T> | T): Promise<T> {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  const had = 'window' in globalThis;
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  try {
    return await fn();
  } finally {
    if (!had) delete g.window;
  }
}

test('a valid save round-trips through storage', async () => {
  await withStorage(async () => {
    const { loadSave, writeSave } = await import('@/lib/secureStorage');
    const save: SaveData = {
      ...defaultSave(),
      streak: 3, maxStreak: 4, played: 5, wins: 3,
      distribution: [0, 1, 1, 1, 0, 0],
      lastSeed: 20260730, lastResult: 'won', highSeed: 20260730,
      day: { seed: 20260730, guesses: ['BEARCRAWL', 'CALFRAISE'], status: 'won' },
    };
    writeSave(save);
    const { save: loaded, tampered } = loadSave();
    assert.equal(tampered, false);
    assert.equal(loaded.streak, 3);
    assert.deepEqual(loaded.day?.guesses, ['BEARCRAWL', 'CALFRAISE']);
  });
});

test('every answer length survives storage validation', async () => {
  for (const word of ['SQUAT', 'BURPEE', 'ARMCURL', 'DEADLIFT', 'BEARCRAWL']) {
    await withStorage(async () => {
      const { loadSave, writeSave } = await import('@/lib/secureStorage');
      writeSave({ ...defaultSave(), day: { seed: 20260730, guesses: [word], status: 'playing' } });
      const { tampered, save } = loadSave();
      assert.equal(tampered, false, `${word.length}-letter guess rejected as tampering`);
      assert.deepEqual(save.day?.guesses, [word]);
    });
  }
});

test('an edited payload with a stale digest is rejected', async () => {
  await withStorage(async () => {
    const { loadSave } = await import('@/lib/secureStorage');
    const good = { ...defaultSave(), streak: 1, maxStreak: 1, played: 1, wins: 1,
      distribution: [1, 0, 0, 0, 0, 0], lastSeed: 20260730, lastResult: 'won' as const, highSeed: 20260730 };
    const raw = JSON.parse(envelope(good));
    const forged = JSON.parse(raw.p);
    forged.streak = 999;
    forged.maxStreak = 999;
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'fitdle:save:v2',
      JSON.stringify({ p: JSON.stringify(forged), h: raw.h }),
    );
    const { save, tampered } = loadSave();
    assert.equal(tampered, true);
    assert.equal(save.streak, 0, 'a rejected save must fail closed to zero');
  });
});

test('an internally impossible save is rejected even with a valid digest', async () => {
  await withStorage(async () => {
    const { loadSave } = await import('@/lib/secureStorage');
    // Correctly signed, but claims more wins than games played.
    const incoherent = { ...defaultSave(), played: 1, wins: 5, streak: 5, maxStreak: 5,
      distribution: [5, 0, 0, 0, 0, 0] };
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'fitdle:save:v2',
      envelope(incoherent as SaveData),
    );
    const { save, tampered } = loadSave();
    assert.equal(tampered, true);
    assert.equal(save.streak, 0);
  });
});

test('mixed-width guesses in one day are rejected', async () => {
  await withStorage(async () => {
    const { loadSave } = await import('@/lib/secureStorage');
    const mixed = {
      ...defaultSave(),
      day: { seed: 20260730, guesses: ['SQUAT', 'DEADLIFT'], status: 'playing' as const },
    };
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'fitdle:save:v2',
      envelope(mixed as SaveData),
    );
    assert.equal(loadSave().tampered, true, 'a day cannot contain two grid widths');
  });
});

test('missing storage does not throw', async () => {
  await withStorage(async () => {
    const { loadSave } = await import('@/lib/secureStorage');
    const { save, tampered } = loadSave();
    assert.equal(tampered, false);
    assert.equal(save.streak, 0);
  });
});
