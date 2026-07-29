'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Dumbbell, Lock, Target } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, selectHints } from '@/store/useGameStore';

/**
 * The progressive-disclosure strip under the board. Guesses 1–2 show only a
 * locked state and a countdown, so the player knows a hint is coming and can
 * spend those two guesses probing deliberately rather than flailing.
 */
export function HintBar() {
  const hints = useGameStore(useShallow(selectHints));
  const wordLength = useGameStore((s) => s.wordLength);

  const chip = 'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold';

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2"
      role="group"
      aria-label="Clues"
    >
      <span className={`${chip} bg-white/5 text-slate-300 ring-1 ring-inset ring-white/10`}>
        <span className="font-game tabular-nums">{wordLength}</span> letters
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        {hints.category ? (
          <motion.span
            key="category"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${chip} bg-state-present/15 text-yellow-300 ring-1 ring-inset ring-state-present/30`}
          >
            <Target className="h-3.5 w-3.5" aria-hidden />
            {hints.category}
          </motion.span>
        ) : (
          <motion.span
            key="category-locked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`${chip} bg-white/5 text-slate-500 ring-1 ring-inset ring-white/10`}
          >
            <Lock className="h-3 w-3" aria-hidden />
            Muscle group in {hints.nextHintIn}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hints.equipment && (
          <motion.span
            key="equipment"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${chip} bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30`}
          >
            <Dumbbell className="h-3.5 w-3.5" aria-hidden />
            {hints.equipment}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
