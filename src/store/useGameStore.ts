'use client';

import { create } from 'zustand';
import {
  ANSWERS,
  CATEGORY_HINT_AT,
  EQUIPMENT_HINT_AT,
  MAX_GUESSES,
  getExercise,
  isValidGuess,
  type Answer,
} from '@/data/exercises';
import type { Equipment, MuscleGroup } from '@/data/muscles';
import { getDailySeed, getDailyIndex } from '@/lib/daily';
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

export interface GameState {
  /* ── board ── */
  seed: number;
  target: Answer;
  /** Today's grid width. Varies 5–9 with the answer. */
  wordLength: number;
  guesses: string[];
  evaluations: LetterState[][];
  currentGuess: string;
  status: GameStatus;
  /**
   * Practice rounds are pure play: no persistence, no streak, no stats. Keeping
   * them entirely out of the save is what stops "practise until you win" from
   * becoming a streak exploit.
   */
  mode: GameMode;

  /* ── persistence ── */
  save: SaveData;
  /** Mirrors `save.streak`; kept top-level per the specification's interface. */
  streak: number;

  /* ── ui ── */
  hydrated: boolean;
  /** Row mid-flip. Blocks input and defers keyboard/figure/hint updates. */
  revealingRow: number | null;
  shakeRow: number | null;
  modalOpen: boolean;
  toast: Toast | null;
  tampered: boolean;
  clockRollback: boolean;

  /* ── actions ── */
  initGame: () => void;
  addLetter: (char: string) => void;
  removeLetter: () => void;
  submitGuess: () => void;
  finishReveal: (row: number) => void;
  setToast: (message: string) => void;
  clearToast: () => void;
  clearShake: () => void;
  setModalOpen: (open: boolean) => void;
  resetProgress: () => void;
  /** Start a random puzzle that cannot affect stats or the streak. */
  startPractice: () => void;
  /** Return to today's puzzle, restoring the saved board. */
  exitPractice: () => void;
  /** Mark today's mini-challenge done. Daily-only, idempotent by seed. */
  markWorkoutDone: () => void;
}

let toastSeq = 0;

/**
 * The initial state must NOT depend on the current date.
 *
 * This page is prerendered — at build time for the static export, at request
 * time otherwise — so anything seeded from `new Date()` here gets baked into
 * the HTML and then disagrees with the client on any later day, which React
 * reports as a hydration mismatch and recovers from by throwing the tree away.
 *
 * So the store boots from a fixed placeholder and `initGame` (client-only,
 * called from an effect) installs the real puzzle. Nothing is visible before
 * that: the board is rendered at opacity 0 until `hydrated` flips.
 */
const PLACEHOLDER = ANSWERS[0];

export const useGameStore = create<GameState>()((set, get) => ({
  seed: 0,
  target: PLACEHOLDER,
  wordLength: PLACEHOLDER.name.length,
  guesses: [],
  evaluations: [],
  currentGuess: '',
  status: 'playing',
  mode: 'daily',

  save: defaultSave(),
  streak: 0,

  hydrated: false,
  revealingRow: null,
  shakeRow: null,
  modalOpen: false,
  toast: null,
  tampered: false,
  clockRollback: false,

  initGame: () => {
    const seed = getDailySeed();
    const target = ANSWERS[getDailyIndex()];

    const { save: loaded, tampered } = loadSave();
    const { save, day, alreadyComplete, clockRollback, streakBroken } = reconcile(loaded, seed);

    // A stored board from a build with a different answer pool would have the
    // wrong width; drop those rows rather than render a broken grid.
    const restored = day.guesses.filter((g) => g.length === target.name.length);
    if (restored.length !== day.guesses.length) {
      day.guesses = restored;
      save.day = day;
    }

    writeSave(save);

    set({
      seed,
      target,
      mode: 'daily',
      wordLength: target.name.length,
      guesses: day.guesses,
      evaluations: day.guesses.map((g) => evaluateGuess(g, target.name)),
      currentGuess: '',
      status: day.status,
      save,
      streak: save.streak,
      hydrated: true,
      revealingRow: null,
      shakeRow: null,
      modalOpen: alreadyComplete,
      tampered,
      clockRollback,
      toast: tampered
        ? { id: ++toastSeq, message: 'Saved progress was invalid — stats reset' }
        : streakBroken
          ? { id: ++toastSeq, message: 'You missed a day — streak reset' }
          : null,
    });
  },

  addLetter: (char) => {
    const { currentGuess, status, revealingRow, wordLength } = get();
    if (status !== 'playing' || revealingRow !== null) return;
    if (currentGuess.length >= wordLength) return;
    if (!/^[a-zA-Z]$/.test(char)) return;
    set({ currentGuess: currentGuess + char.toUpperCase() });
  },

  removeLetter: () => {
    const { status, revealingRow, currentGuess } = get();
    if (status !== 'playing' || revealingRow !== null) return;
    set({ currentGuess: currentGuess.slice(0, -1) });
  },

  submitGuess: () => {
    const {
      currentGuess, target, wordLength, guesses, evaluations,
      status, revealingRow, save, seed, clockRollback, mode,
    } = get();

    if (status !== 'playing' || revealingRow !== null) return;

    if (currentGuess.length !== wordLength) {
      set({
        shakeRow: guesses.length,
        toast: { id: ++toastSeq, message: `Needs ${wordLength} letters` },
      });
      return;
    }

    // Guesses must be real exercises of today's length — that constraint is
    // what makes the space knowable, and the exercise index makes it fair.
    if (!isValidGuess(currentGuess, wordLength)) {
      set({
        shakeRow: guesses.length,
        toast: { id: ++toastSeq, message: 'Not an exercise in the list' },
      });
      return;
    }

    if (guesses.includes(currentGuess)) {
      set({
        shakeRow: guesses.length,
        toast: { id: ++toastSeq, message: 'Already guessed' },
      });
      return;
    }

    const row = guesses.length;
    const evaluation = evaluateGuess(currentGuess, target.name);
    const newGuesses = [...guesses, currentGuess];
    const newEvaluations = [...evaluations, evaluation];

    const won = currentGuess === target.name;
    const lost = !won && newGuesses.length === MAX_GUESSES;
    const newStatus: GameStatus = won ? 'won' : lost ? 'lost' : 'playing';

    // Practice never touches the save. Not persisting is the whole guarantee:
    // there is no path from a practice round to a streak, so replaying until
    // you win buys nothing.
    if (mode === 'practice') {
      set({
        guesses: newGuesses,
        evaluations: newEvaluations,
        currentGuess: '',
        status: newStatus,
        revealingRow: row,
      });
      return;
    }

    let nextSave: SaveData = {
      ...save,
      day: { seed, guesses: newGuesses, status: newStatus },
    };

    if (newStatus !== 'playing') {
      nextSave = commitResult(nextSave, seed, won, newGuesses.length, !clockRollback);
    }

    writeSave(nextSave);

    // Fire-and-forget push so a finished daily lands on the other devices.
    // Deliberately not awaited: a slow or failed network must never delay the
    // tile flip, and local storage already holds the authoritative copy.
    if (newStatus !== 'playing') {
      void import('@/store/useAuthStore').then((m) => m.syncAfterGame());
    }

    set({
      guesses: newGuesses,
      evaluations: newEvaluations,
      currentGuess: '',
      status: newStatus,
      save: nextSave,
      streak: nextSave.streak,
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

  startPractice: () => {
    // Any answer except today's, so practice cannot spoil the daily puzzle.
    const todays = ANSWERS[getDailyIndex()].name;
    const pool = ANSWERS.filter((a) => a.name !== todays);
    const target = pool[Math.floor(Math.random() * pool.length)];

    set({
      mode: 'practice',
      target,
      wordLength: target.name.length,
      guesses: [],
      evaluations: [],
      currentGuess: '',
      status: 'playing',
      revealingRow: null,
      shakeRow: null,
      modalOpen: false,
      toast: { id: ++toastSeq, message: 'Practice round — streak is safe' },
    });
  },

  // Re-runs the daily reconciliation, which restores the saved board. Practice
  // state was never written anywhere, so there is nothing to clean up.
  exitPractice: () => get().initGame(),

  markWorkoutDone: () => {
    const { mode, save, seed } = get();
    // Practice has no date of its own, so it can have no workout streak either.
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
            ? `Logged — ${next.workoutStreak} day workout streak`
            : 'Workout logged',
      },
    });
  },

  resetProgress: () => {
    clearSave();
    const fresh = defaultSave();
    writeSave(fresh);

    // A merge cannot express a deletion (every counter takes the max), so the
    // cleared save has to be pushed over the cloud copy. Without this, reset
    // looks like it worked and then the next sync puts everything back.
    void import('@/store/useAuthStore').then((m) =>
      m.useAuthStore.getState().overwriteCloud(fresh),
    );
    set({
      guesses: [],
      evaluations: [],
      currentGuess: '',
      status: 'playing',
      save: fresh,
      streak: 0,
      revealingRow: null,
      modalOpen: false,
      tampered: false,
      toast: { id: ++toastSeq, message: 'Progress cleared' },
    });
  },
}));

/**
 * Guesses whose reveal animation has finished. Everything derived — keyboard
 * colours, the muscle figure, the hint unlocks — reads from this so nothing
 * updates mid-flip and spoils the reveal.
 */
export function revealedCount(state: Pick<GameState, 'guesses' | 'revealingRow'>): number {
  return state.revealingRow === null ? state.guesses.length : state.revealingRow;
}

export function selectKeyStates(state: GameState): Record<string, LetterState> {
  const upTo = revealedCount(state);
  return buildKeyStates(state.guesses.slice(0, upTo), state.evaluations.slice(0, upTo));
}

export interface Hints {
  /** The answer's muscle group, or null while still locked. */
  category: MuscleGroup | null;
  equipment: Equipment | null;
  /** Guesses remaining until the next hint, or null when all are out. */
  nextHintIn: number | null;
}

/**
 * Progressive disclosure. Two blind guesses of genuine deduction first — the
 * figure still reports overlap from your own guesses during those — then the
 * category as a safety net, then equipment.
 *
 * MUST be wrapped in `useShallow`. It builds a fresh object per call and
 * Zustand v5 compares snapshots by reference, so a bare `useGameStore(selectHints)`
 * re-renders until React throws "Maximum update depth exceeded". Same rule as
 * `selectKeyStates`. All three fields are primitives, so shallow compare is exact.
 */
export function selectHints(state: GameState): Hints {
  const revealed = revealedCount(state);
  const finished = state.status !== 'playing';

  const categoryOut = finished || revealed >= CATEGORY_HINT_AT - 1;
  const equipmentOut = finished || revealed >= EQUIPMENT_HINT_AT - 1;

  return {
    category: categoryOut ? state.target.group : null,
    equipment: equipmentOut ? state.target.equipment : null,
    nextHintIn: categoryOut
      ? equipmentOut
        ? null
        : EQUIPMENT_HINT_AT - 1 - revealed
      : CATEGORY_HINT_AT - 1 - revealed,
  };
}

export function selectWinRate(state: GameState): number {
  const { played, wins } = state.save;
  return played === 0 ? 0 : Math.round((wins / played) * 100);
}

/** Display name for a guessed row, used by the guess history list. */
export function displayNameOf(name: string): string {
  return getExercise(name)?.display ?? name;
}
