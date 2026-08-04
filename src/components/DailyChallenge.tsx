'use client';

import { motion } from 'framer-motion';
import { Check, Dumbbell, Flame } from 'lucide-react';
import { useGameStore } from '@/store/useGameStore';

/**
 * The bridge from word game to actual training.
 *
 * A guessing game about exercises that never asks you to do one is a crossword
 * with a fitness skin. This turns the answer into a prescription and gives it
 * its own streak, tracked separately from the puzzle streak — because getting
 * the word is not the same achievement as doing the work, and conflating them
 * would let one paper over the other.
 *
 * Marking it done is on the honour system, and deliberately so: verifying a set
 * of squats is not something a browser can do, and pretending otherwise would
 * be worse than trusting the player. The streak is for them, not for a
 * leaderboard — there isn't one.
 */
export function DailyChallenge() {
  const target = useGameStore((s) => s.reveal);
  const mode = useGameStore((s) => s.mode);
  const seed = useGameStore((s) => s.seed);
  const save = useGameStore((s) => s.save);
  const markWorkoutDone = useGameStore((s) => s.markWorkoutDone);

  // Practice rounds have no date, so they can have no workout streak. And
  // without a revealed answer there is no movement to prescribe.
  if (mode !== 'daily' || !target || !target.challenge) return null;

  const done = save.lastWorkoutSeed === seed;
  const streak = save.workoutStreak ?? 0;

  return (
    <section className="rounded-xl bg-black/25 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="label flex items-center gap-1.5">
          <Dumbbell className="h-3 w-3" aria-hidden />
          Today&apos;s challenge
        </h3>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">
            <Flame className="h-3 w-3" />
            {streak} day{streak === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-slate-300">
        You found it — now do it.{' '}
        <strong className="numeric text-white">{target.challenge}</strong>{' '}
        <strong className="text-white">{target.display}</strong>.
      </p>

      {done ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center gap-2 rounded-xl bg-state-correct/12 px-4 py-3 text-sm font-semibold text-state-correct ring-1 ring-inset ring-state-correct/30"
        >
          <Check className="h-4 w-4" />
          Logged for today
        </motion.div>
      ) : (
        <button type="button" onClick={markWorkoutDone} className="btn btn-ghost w-full">
          <Check className="h-4 w-4" />
          I did it
        </button>
      )}

      <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
        {done
          ? 'Counts once per day. Come back tomorrow.'
          : 'Honour system — nobody is checking, and there is no leaderboard.'}
      </p>
    </section>
  );
}
