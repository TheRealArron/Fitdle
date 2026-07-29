import { MAX_GUESSES } from '@/data/exercises';
import { daysBetweenSeeds } from '@/lib/daily';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THREAT MODEL — read this before trusting the word "secure".
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything here runs on the player's machine and every byte of it — the
 * digest function, the key, the record format — ships inside the JS bundle. A
 * determined user can therefore always forge a valid save. That is not a bug in
 * this file; it is a property of client-only persistence. Real tamper-proofing
 * needs a server that owns the streak.
 *
 * What this layer actually buys, in descending order of value:
 *
 *   1. REPLAY RESISTANCE (the big one). The specification's store incremented
 *      the streak on every win, and `initGame` reset the board while keeping
 *      the streak. So: win, refresh, win again, forever. Streak inflation with
 *      zero tooling. Here a puzzle can only ever pay out once, enforced by
 *      `lastSeed`, and wiping storage to retry resets the streak to zero — the
 *      cheat is strictly worse than playing.
 *   2. CLOCK-ROLLBACK RESISTANCE. `highSeed` is a monotonic high-water mark.
 *      Winding the system clock back to farm past puzzles is detected and those
 *      puzzles pay no streak.
 *   3. INTEGRITY. A keyed 128-bit digest over a canonical serialisation. Stops
 *      hand-editing `"streak":3` in devtools, which is the realistic attack.
 *      The spec's digest was a 32-bit non-keyed hash rendered as short hex —
 *      forgeable in a one-line console expression and collision-prone besides.
 *   4. FAIL-CLOSED. A record that does not verify is discarded, not trusted.
 */

const STORAGE_KEY = 'fitdle:save:v2';
const LEGACY_KEY = 'fitdle-data';
const SAVE_VERSION = 2;

/**
 * Domain-separation key. Obfuscation, not a secret — see the threat model. It
 * exists so that a digest lifted from another app or an older Fitdle build does
 * not verify here.
 */
const DIGEST_KEY = 'fitdle/v2/streak-integrity';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface DayRecord {
  seed: number;
  guesses: string[];
  status: GameStatus;
}

export interface SaveData {
  version: number;
  streak: number;
  maxStreak: number;
  played: number;
  wins: number;
  /** distribution[i] = games won on guess i+1. */
  distribution: number[];
  /** Seed of the last puzzle that was *completed*. Anti-replay anchor. */
  lastSeed: number | null;
  lastResult: 'won' | 'lost' | null;
  /** Highest seed ever observed. Monotonic; catches clock rollback. */
  highSeed: number;
  /** In-progress (or finished) board for a single day. */
  day: DayRecord | null;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    streak: 0,
    maxStreak: 0,
    played: 0,
    wins: 0,
    distribution: new Array(MAX_GUESSES).fill(0),
    lastSeed: null,
    lastResult: null,
    highSeed: 0,
    day: null,
  };
}

/* ── digest ───────────────────────────────────────────────────────────────── */

/**
 * Keyed 128-bit digest, four independent FNV-1a-style lanes with distinct
 * primes and per-lane rotation, finished with an avalanche mix. Synchronous on
 * purpose: the store writes on every keystroke-completed guess, and SubtleCrypto
 * would force the whole persistence path to go async for no security gain
 * (the key is public either way).
 */
const LANE_PRIMES = [0x01000193, 0x01000ed3, 0x00b0f21b, 0x0184e5d1];
const LANE_SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

function rotl(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function avalanche(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function digest(payload: string, key: string = DIGEST_KEY): string {
  // Length is folded in explicitly so truncation/extension changes the digest.
  const input = `${key}${payload}${payload.length}${key}`;
  const lanes = [...LANE_SEEDS];

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    for (let l = 0; l < 4; l++) {
      lanes[l] = (lanes[l] ^ (code + l * 0x9e37)) >>> 0;
      lanes[l] = Math.imul(lanes[l], LANE_PRIMES[l]) >>> 0;
      lanes[l] = rotl(lanes[l], 5 + l * 3);
    }
  }

  // Cross-diffuse so a change in one lane reaches all four.
  for (let round = 0; round < 2; round++) {
    for (let l = 0; l < 4; l++) {
      lanes[l] = (lanes[l] ^ rotl(lanes[(l + 1) & 3], 11 + l)) >>> 0;
      lanes[l] = avalanche(lanes[l]);
    }
  }

  return lanes.map((l) => l.toString(16).padStart(8, '0')).join('');
}

/**
 * Canonical serialisation. `JSON.stringify` key order follows insertion order,
 * so two logically identical saves could serialise differently and fail their
 * own digest. Sorting keys makes the digest a function of the value alone.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',');
  return `{${body}}`;
}

/* ── storage adapter ──────────────────────────────────────────────────────── */

function readRaw(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    // Safari private mode, disabled storage, sandboxed iframe.
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    /* Play on without persistence rather than crashing the game. */
  }
}

function removeRaw(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}

/* ── validation ───────────────────────────────────────────────────────────── */

const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;

/** Shape of a stored guess. Answers run 5–9 letters; 4–10 leaves headroom. */
const GUESS_NAME = /^[A-Z]{4,10}$/;

/**
 * Structural + semantic validation. A forged record that verifies must still be
 * internally coherent, which removes the easy wins (streak of 9e99, more wins
 * than games played, a distribution that does not sum to the win count).
 */
function isCoherent(d: unknown): d is SaveData {
  if (!d || typeof d !== 'object') return false;
  const s = d as Record<string, unknown>;

  if (s.version !== SAVE_VERSION) return false;
  if (!isInt(s.streak) || !isInt(s.maxStreak) || !isInt(s.played) || !isInt(s.wins)) return false;
  if (!isInt(s.highSeed)) return false;
  if (!Array.isArray(s.distribution) || s.distribution.length !== MAX_GUESSES) return false;
  if (!s.distribution.every(isInt)) return false;

  if (s.wins > s.played) return false;
  if (s.streak > s.wins) return false;
  if (s.maxStreak < s.streak) return false;
  if ((s.distribution as number[]).reduce((a, b) => a + b, 0) !== s.wins) return false;

  if (s.lastSeed !== null && !isInt(s.lastSeed)) return false;
  if (s.lastResult !== null && s.lastResult !== 'won' && s.lastResult !== 'lost') return false;

  if (s.day !== null) {
    const day = s.day as Record<string, unknown>;
    if (!day || typeof day !== 'object') return false;
    if (!isInt(day.seed)) return false;
    if (!Array.isArray(day.guesses) || day.guesses.length > MAX_GUESSES) return false;
    // Answers run 5–9 letters since the fixed-width grid was dropped. Pinning
    // this to 5 silently rejected every save on a long-word day, which read as
    // tampering and wiped the streak. Keep it in sync with GUESS_NAME.
    if (!day.guesses.every((g) => typeof g === 'string' && GUESS_NAME.test(g))) return false;
    // All guesses in a day must share the answer's width.
    if (day.guesses.length > 0) {
      const width = (day.guesses[0] as string).length;
      if (!day.guesses.every((g) => (g as string).length === width)) return false;
    }
    if (day.status !== 'playing' && day.status !== 'won' && day.status !== 'lost') return false;
  }

  return true;
}

/* ── public API ───────────────────────────────────────────────────────────── */

export interface LoadResult {
  save: SaveData;
  /** True when a record existed but failed integrity or coherence checks. */
  tampered: boolean;
}

export function loadSave(): LoadResult {
  const raw = readRaw(STORAGE_KEY);

  if (!raw) {
    const migrated = migrateLegacy();
    return { save: migrated ?? defaultSave(), tampered: false };
  }

  try {
    const envelope = JSON.parse(raw) as { p?: unknown; h?: unknown };
    if (typeof envelope.p !== 'string' || typeof envelope.h !== 'string') {
      return { save: defaultSave(), tampered: true };
    }
    if (digest(envelope.p) !== envelope.h) {
      return { save: defaultSave(), tampered: true };
    }
    const parsed = JSON.parse(envelope.p);
    if (!isCoherent(parsed)) {
      return { save: defaultSave(), tampered: true };
    }
    return { save: parsed, tampered: false };
  } catch {
    return { save: defaultSave(), tampered: true };
  }
}

export function writeSave(save: SaveData): void {
  const payload = canonical(save);
  writeRaw(STORAGE_KEY, JSON.stringify({ p: payload, h: digest(payload) }));
}

export function clearSave(): void {
  removeRaw(STORAGE_KEY);
  removeRaw(LEGACY_KEY);
}

/**
 * One-time upgrade from the specification's `{ v, h }` record, which stored the
 * streak as a bare string. There is no way to know which puzzle that streak
 * belongs to, so it is carried over but left un-anchored: `lastSeed` stays null
 * and the next completed puzzle establishes the anchor.
 */
function migrateLegacy(): SaveData | null {
  const raw = readRaw(LEGACY_KEY);
  if (!raw) return null;

  try {
    const { v, h } = JSON.parse(raw) as { v?: unknown; h?: unknown };
    if (typeof v !== 'string' || typeof h !== 'string') return null;

    const legacyHash = v
      .split('')
      .reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0)
      .toString(16);
    if (legacyHash !== h) return null;

    const streak = parseInt(v, 10);
    if (!Number.isFinite(streak) || streak < 0 || streak > 10_000) return null;

    const save = defaultSave();
    save.streak = streak;
    save.maxStreak = streak;
    save.played = streak;
    save.wins = streak;
    // Attribute migrated wins to the middle of the distribution; it is a guess,
    // but leaving it empty would fail the coherence check on the next load.
    save.distribution[2] = streak;
    return save;
  } catch {
    return null;
  } finally {
    removeRaw(LEGACY_KEY);
  }
}

/* ── daily reconciliation ─────────────────────────────────────────────────── */

export interface Reconciled {
  save: SaveData;
  /** Board to hand to the store for today. */
  day: DayRecord;
  /** Today's puzzle was already finished in a previous session. */
  alreadyComplete: boolean;
  /** System clock appears to be behind a previously observed date. */
  clockRollback: boolean;
  /** Streak was broken by a missed day during this reconciliation. */
  streakBroken: boolean;
}

/**
 * Brings a loaded save up to date with today, before any play happens.
 *
 * Handles the three cases the spec's `initGame` did not: a day was missed (the
 * streak must break), today is already finished (restore the finished board
 * instead of handing out a fresh one), and the clock has moved backwards.
 */
export function reconcile(input: SaveData, todaySeed: number): Reconciled {
  const save: SaveData = { ...input, distribution: [...input.distribution] };
  const clockRollback = save.highSeed > 0 && todaySeed < save.highSeed;
  let streakBroken = false;

  if (!clockRollback) {
    save.highSeed = Math.max(save.highSeed, todaySeed);
  }

  if (save.lastSeed !== null) {
    const gap = daysBetweenSeeds(save.lastSeed, todaySeed);
    if (gap > 1 && save.streak > 0) {
      save.streak = 0;
      streakBroken = true;
    }
  }

  const sameDay = save.day !== null && save.day.seed === todaySeed;
  const day: DayRecord = sameDay
    ? { ...save.day!, guesses: [...save.day!.guesses] }
    : { seed: todaySeed, guesses: [], status: 'playing' };

  save.day = day;

  return {
    save,
    day,
    alreadyComplete: day.status !== 'playing',
    clockRollback,
    streakBroken,
  };
}

/**
 * Records a finished puzzle. Idempotent by seed — the anti-replay guarantee.
 * Calling it twice for the same puzzle (double submit, refresh mid-animation,
 * a second tab) changes nothing the second time.
 */
export function commitResult(
  input: SaveData,
  seed: number,
  won: boolean,
  guessCount: number,
  creditStreak: boolean,
): SaveData {
  if (input.lastSeed === seed) return input;

  const save: SaveData = { ...input, distribution: [...input.distribution] };

  save.played += 1;
  if (won) {
    save.wins += 1;
    if (guessCount >= 1 && guessCount <= MAX_GUESSES) {
      save.distribution[guessCount - 1] += 1;
    }
    if (creditStreak) {
      save.streak += 1;
      save.maxStreak = Math.max(save.maxStreak, save.streak);
    }
  } else {
    save.streak = 0;
  }

  save.lastSeed = seed;
  save.lastResult = won ? 'won' : 'lost';
  save.highSeed = Math.max(save.highSeed, seed);

  return save;
}
