'use client';

import { create } from 'zustand';
import {
  CATALOGUE,
  MAX_GUESSES,
  getExercise,
  isValidGuess,
  musclesOf,
  type Exercise,
} from '@/data/exercises';
import type { Equipment, MuscleGroup, MuscleRegion } from '@/data/muscles';
import {
  fetchToday,
  isRejection,
  placeCall as placeCallApi,
  submitGuess as submitGuessApi,
  type RevealedAnswer,
} from '@/lib/api';
import type { Hints } from '@/lib/contracts';
import { adoptServerTime } from '@/lib/trustedTime';
import { evaluateGuess, buildKeyStates, type LetterState } from '@/lib/evaluate';
import {
  loadSave,
  writeSave,
  clearSave,
  defaultSave,
  reconcile,
  commitResult,
  commitWorkout,
  type SaveData,
  type GameStatus,
} from '@/lib/secureStorage';

export interface Toast {
  id: number;
  message: string;
}

export type GameMode = 'daily' | 'practice';

/**
 * What the client knows about the target.
 *
 * For the DAILY this is null until the server reveals it - the browser cannot
 * see today's answer, by construction. For PRACTICE the client picks and scores
 * locally, which is safe precisely because practice touches no streak: leaking
 * a practice answer costs nothing, and requiring a round trip per practice
 * guess would make the mode worse for no gain.
 */
export type Target = RevealedAnswer;

export interface GameState {
  seed: number;
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  currentGuess: string;
  status: GameStatus;
  mode: GameMode;

  /** Server-computed for the daily; locally derived in practice. */
  muscles: { shared: MuscleRegion[]; missed: MuscleRegion[] };
  hints: { category: MuscleGroup | null; equipment: Equipment | null; nextHintIn: number | null };
  /** Non-null only once the round is over. The only path to the answer. */
  reveal: Target | null;
  /** The opening muscle-group call, once made. Server-scored. */
  call: { group: MuscleGroup; correct: boolean } | null;

  /** Opaque signed session from the server. Daily only. */
  serverState: string | null;
  /** True when the API could not be reached; the daily is unplayable offline. */
  offline: boolean;

  save: SaveData;
  streak: number;

  hydrated: boolean;
  loading: boolean;
  revealingRow: number | null;
  shakeRow: number | null;
  modalOpen: boolean;
  toast: Toast | null;
  tampered: boolean;
  clockRollback: boolean;

  initGame: () => Promise<void>;
  addLetter: (char: string) => void;
  removeLetter: () => void;
  submitGuess: () => Promise<void>;
  finishReveal: (row: number) => void;
  setToast: (message: string) => void;
  clearToast: () => void;
  clearShake: () => void;
  setModalOpen: (open: boolean) => void;
  resetProgress: () => void;
  startPractice: () => void;
  exitPractice: () => Promise<void>;
  markWorkoutDone: () => void;
  /** Lock in the opening muscle-group call. Daily only, before guess 1. */
  placeCall: (group: MuscleGroup) => Promise<void>;
}

let toastSeq = 0;

/**
 * Practice draws from the WHOLE catalogue, not the daily answer pool.
 *
 * The client no longer knows which words can be answers, and that is the point:
 * publishing that subset is what made the daily solvable in two guesses. Any
 * exercise makes a fine practice round, so nothing is lost by widening it.
 */
const PRACTICE_POOL = CATALOGUE;

const EMPTY_MUSCLES = { shared: [] as MuscleRegion[], missed: [] as MuscleRegion[] };
const NO_HINTS = { category: null, equipment: null, nextHintIn: null };

/** Local muscle overlap, used only in practice. Mirrors the server's rule. */
function localMuscles(guesses: string[], answer: Exercise) {
  const target = musclesOf(answer);
  const shared = new Set<MuscleRegion>();
  const missed = new Set<MuscleRegion>();
  for (const name of guesses) {
    const g = getExercise(name);
    if (!g) continue;
    for (const m of musclesOf(g)) (target.has(m) ? shared : missed).add(m);
  }
  return { shared: [...shared], missed: [...missed] };
}

function toTarget(e: Exercise): Target {
  return {
    name: e.name,
    display: e.display,
    group: e.group,
    equipment: e.equipment,
    difficulty: e.difficulty,
    primary: e.primary,
    secondary: e.secondary,
    // Coaching content is server-only, so practice shows the muscle map and a
    // search link rather than a curated video or a daily challenge.
    howTo: [],
    videoId: null,
    videoQuery: `${e.display} proper form`,
    challenge: '',
    homeVersion: null,
  };
}

export const useGameStore = create<GameState>()((set, get) => ({
  seed: 0,
  wordLength: 5,
  guesses: [],
  evaluations: [],
  currentGuess: '',
  status: 'playing',
  mode: 'daily',

  muscles: EMPTY_MUSCLES,
  hints: NO_HINTS,
  reveal: null,
  call: null,
  serverState: null,
  offline: false,

  save: defaultSave(),
  streak: 0,

  hydrated: false,
  loading: true,
  revealingRow: null,
  shakeRow: null,
  modalOpen: false,
  toast: null,
  tampered: false,
  clockRollback: false,

  /**
   * Asks the server for today's puzzle. The seed, the width and the scoring all
   * come from there - a wound-forward local clock changes nothing.
   */
  initGame: async () => {
    set({ loading: true });

    const { save: loaded, tampered } = loadSave();
    const stored = loaded.day?.serverState ?? undefined;

    const result = await fetchToday(stored);

    if (!result.ok) {
      // Fail closed. Guessing offline would mean scoring locally, which needs
      // the answer, which is the thing we just stopped shipping.
      set({
        loading: false,
        hydrated: true,
        offline: true,
        toast: { id: ++toastSeq, message: 'Cannot reach the server - try again shortly' },
      });
      return;
    }

    const d = result.data;
    // Every response carries the server clock; the countdown follows it.
    adoptServerTime(d.serverTime);

    const { save, clockRollback, streakBroken } = reconcile(loaded, d.seed);

    save.day = {
      seed: d.seed,
      guesses: d.guesses,
      status: d.status,
      serverState: d.state,
    };

    // The server is the authority on whether the round is finished, so the
    // result is banked here rather than trusting a client-side status.
    let next = save;
    if (d.status !== 'playing') {
      next = commitResult(save, d.seed, d.status === 'won', d.guesses.length, !clockRollback);
      next.day = save.day;
    }
    writeSave(next);

    set({
      seed: d.seed,
      mode: 'daily',
      wordLength: d.wordLength,
      guesses: d.guesses,
      evaluations: d.evaluations,
      muscles: d.muscles,
      hints: d.hints as GameState['hints'],
      reveal: d.reveal,
      call: d.call,
      serverState: d.state,
      offline: false,
      currentGuess: '',
      status: d.status,
      save: next,
      streak: next.streak,
      hydrated: true,
      loading: false,
      revealingRow: null,
      shakeRow: null,
      modalOpen: d.status !== 'playing',
      tampered,
      clockRollback,
      toast: tampered
        ? { id: ++toastSeq, message: 'Saved progress was invalid - stats reset' }
        : streakBroken
          ? { id: ++toastSeq, message: 'You missed a day - streak reset' }
          : null,
    });
  },

  addLetter: (char) => {
    const { currentGuess, status, revealingRow, wordLength, offline } = get();
    if (offline || status !== 'playing' || revealingRow !== null) return;
    if (currentGuess.length >= wordLength) return;
    if (!/^[a-zA-Z]$/.test(char)) return;
    set({ currentGuess: currentGuess + char.toUpperCase() });
  },

  removeLetter: () => {
    const { status, revealingRow, currentGuess } = get();
    if (status !== 'playing' || revealingRow !== null) return;
    set({ currentGuess: currentGuess.slice(0, -1) });
  },

  submitGuess: async () => {
    const {
      currentGuess, wordLength, guesses, evaluations, status,
      revealingRow, save, seed, clockRollback, mode, serverState, reveal,
    } = get();

    if (status !== 'playing' || revealingRow !== null) return;

    if (currentGuess.length !== wordLength) {
      set({ shakeRow: guesses.length, toast: { id: ++toastSeq, message: `Needs ${wordLength} letters` } });
      return;
    }

    /* ── practice: scored locally, never persisted ── */
    if (mode === 'practice') {
      const answer = reveal;
      if (!answer) return;
      if (!isValidGuess(currentGuess, wordLength)) {
        set({ shakeRow: guesses.length, toast: { id: ++toastSeq, message: 'Not an exercise in the list' } });
        return;
      }
      if (guesses.includes(currentGuess)) {
        set({ shakeRow: guesses.length, toast: { id: ++toastSeq, message: 'Already guessed' } });
        return;
      }

      const row = guesses.length;
      const newGuesses = [...guesses, currentGuess];
      const won = currentGuess === answer.name;
      const lost = !won && newGuesses.length === MAX_GUESSES;
      const target = getExercise(answer.name)!;

      set({
        guesses: newGuesses,
        evaluations: [...evaluations, evaluateGuess(currentGuess, answer.name)],
        muscles: localMuscles(newGuesses, target),
        currentGuess: '',
        status: won ? 'won' : lost ? 'lost' : 'playing',
        revealingRow: row,
      });
      return;
    }

    /* ── daily: the server decides ── */
    if (!serverState) return;
    const row = guesses.length;

    const result = await submitGuessApi(currentGuess, serverState);
    if (!result.ok) {
      set({ shakeRow: row, toast: { id: ++toastSeq, message: result.error } });
      return;
    }

    if (isRejection(result.data)) {
      set({
        shakeRow: row,
        serverState: result.data.state,
        toast: { id: ++toastSeq, message: result.data.message },
      });
      return;
    }

    const d = result.data;
    adoptServerTime(d.serverTime);

    let next: SaveData = {
      ...save,
      day: { seed, guesses: d.guesses, status: d.status, serverState: d.state },
    };
    if (d.status !== 'playing') {
      const day = next.day;

      /*
       * `d.progress` is the server's record, written the moment the round ended
       * for a signed-in player. Adopt it WHOLESALE rather than merging: it is
       * authoritative, the local copy is a cache, and merging would let an
       * edited local save pull the displayed streak back up - which is the
       * exact hole this change closes.
       *
       * Anonymous play, or a deployment with no service-role key, falls back to
       * computing it locally as before. That save is still forgeable; it is
       * also still private, and it is not what a leaderboard would read.
       */
      next = d.progress
        ? { ...d.progress, day }
        : commitResult(next, seed, d.status === 'won', d.guesses.length, !clockRollback);
      next.day = day;
    }
    writeSave(next);

    set({
      guesses: d.guesses,
      evaluations: d.evaluations,
      muscles: d.muscles,
      hints: d.hints as GameState['hints'],
      reveal: d.reveal,
      call: d.call,
      serverState: d.state,
      currentGuess: '',
      status: d.status,
      save: next,
      streak: next.streak,
      revealingRow: row,
    });
  },

  finishReveal: (row) => {
    if (get().revealingRow !== row) return;
    set({ revealingRow: null });

    const { status } = get();
    if (status !== 'playing') {
      setTimeout(
        () => {
          if (get().status !== 'playing') set({ modalOpen: true });
        },
        status === 'won' ? 1500 : 900,
      );
    }
  },

  setToast: (message) => set({ toast: { id: ++toastSeq, message } }),
  clearToast: () => set({ toast: null }),
  clearShake: () => set({ shakeRow: null }),
  setModalOpen: (open) => set({ modalOpen: open }),

  resetProgress: () => {
    clearSave();
    const fresh = defaultSave();
    writeSave(fresh);
    void import('@/store/useAuthStore').then((m) => m.overwriteCloudIfSignedIn(fresh));
    set({
      save: fresh,
      streak: 0,
      toast: { id: ++toastSeq, message: 'Progress cleared' },
    });
    void get().initGame();
  },

  /**
   * Practice picks locally from the answer-eligible pool. That is safe because
   * practice can never touch a streak - leaking a practice answer costs nothing,
   * and it keeps the mode playable without a round trip per guess.
   */
  startPractice: () => {
    const todays = get().reveal?.name;
    const pool = PRACTICE_POOL.filter((e) => e.name !== todays);
    const pick = pool[Math.floor(Math.random() * pool.length)];

    set({
      mode: 'practice',
      wordLength: pick.name.length,
      guesses: [],
      evaluations: [],
      muscles: EMPTY_MUSCLES,
      // Practice shows the answer's identity up front in `reveal` because the
      // client is scoring; the UI still hides it until the round ends.
      reveal: toTarget(pick),
      hints: NO_HINTS,
      currentGuess: '',
      status: 'playing',
      revealingRow: null,
      shakeRow: null,
      modalOpen: false,
      call: null,
      toast: { id: ++toastSeq, message: 'Practice round - streak is safe' },
    });
  },

  exitPractice: () => get().initGame(),

  placeCall: async (group) => {
    const { serverState, mode, guesses } = get();
    // Server enforces these too; checking here only avoids a pointless request.
    if (mode !== 'daily' || !serverState || guesses.length > 0) return;

    const result = await placeCallApi(group, serverState);
    if (!result.ok) {
      set({ toast: { id: ++toastSeq, message: result.error } });
      return;
    }

    const d = result.data;
    adoptServerTime(d.serverTime);
    set({
      call: d.call,
      hints: d.hints as GameState['hints'],
      serverState: d.state,
      toast: {
        id: ++toastSeq,
        message: d.call?.correct
          ? `Called it. Equipment unlocked.`
          : `Not ${group}. Category hint forfeited.`,
      },
    });
  },

  markWorkoutDone: () => {
    const { mode, save, seed } = get();
    if (mode !== 'daily') return;
    if (save.lastWorkoutSeed === seed) return;

    const next = commitWorkout(save, seed);
    writeSave(next);
    void import('@/store/useAuthStore').then((m) => m.syncAfterGame());

    set({
      save: next,
      toast: {
        id: ++toastSeq,
        message:
          (next.workoutStreak ?? 0) > 1
            ? `Logged - ${next.workoutStreak} day workout streak`
            : 'Workout logged',
      },
    });
  },
}));

/**
 * Guesses whose reveal animation has finished. Everything derived reads from
 * this so nothing updates mid-flip and spoils the reveal.
 */
function revealedCount(state: Pick<GameState, 'guesses' | 'revealingRow'>): number {
  return state.revealingRow === null ? state.guesses.length : state.revealingRow;
}

export function selectKeyStates(state: GameState): Record<string, LetterState> {
  const upTo = revealedCount(state);
  return buildKeyStates(state.guesses.slice(0, upTo), state.evaluations.slice(0, upTo));
}


/**
 * Hints are computed server-side and arrive with each response, so the browser
 * cannot unlock them early by lying about its guess count.
 */
export function selectHints(state: GameState): Hints {
  // Suppress until the flip finishes, so a hint never lands before its row.
  if (state.revealingRow !== null && state.status === 'playing') {
    return state.hints.nextHintIn === null ? state.hints : { ...state.hints };
  }
  return state.hints;
}

export function selectWinRate(state: GameState): number {
  const { played, wins } = state.save;
  return played === 0 ? 0 : Math.round((wins / played) * 100);
}

