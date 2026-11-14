'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Target, X } from 'lucide-react';
import { useState } from 'react';
import { GROUP_ORDER, type MuscleGroup } from '@/data/muscles';
import { useGameStore } from '@/store/useGameStore';

/**
 * The opening muscle-group call.
 *
 * Every other source of advantage in this game is letter entropy, which a
 * solver plays better than a person. This one is not: it asks what the answer
 * trains before any letter is known, so the only way to be right is to actually
 * know the exercises.
 *
 *   right -> the equipment hint lands immediately
 *   wrong -> you forfeit the guess-3 category hint
 *   skip  -> the ordinary game
 *
 * Optional on purpose. A confident player gets a real edge for taking a real
 * risk; an unsure one keeps the safety net and loses nothing.
 */
export function OpeningCall() {
  const call = useGameStore((s) => s.call);
  const guesses = useGameStore((s) => s.guesses);
  const mode = useGameStore((s) => s.mode);
  const status = useGameStore((s) => s.status);
  const placeCall = useGameStore((s) => s.placeCall);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only before the first guess, only on the daily, only once.
  const available = mode === 'daily' && status === 'playing' && guesses.length === 0 && !call;
  if (!available && !call) return null;

  if (call) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={[
          'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset',
          call.correct
            ? 'bg-state-correct/15 text-state-correct ring-state-correct/30'
            : 'bg-state-excluded/25 text-rose-300 ring-rose-500/25',
        ].join(' ')}
      >
        {call.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        Called {call.group}
        <span className="font-normal opacity-80">
          {call.correct ? '· equipment unlocked' : '· category hint forfeited'}
        </span>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.button
            key="prompt"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Target className="h-3.5 w-3.5" />
            Call the muscle group?
          </motion.button>
        ) : (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel-raised flex max-w-md flex-col gap-2 rounded-xl p-3"
          >
            <p className="text-center text-xs leading-snug text-slate-400">
              Right and the equipment hint unlocks now. Wrong and you lose the guess-3 category
              hint.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {GROUP_ORDER.map((g: MuscleGroup) => (
                <button
                  key={g}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await placeCall(g);
                    setBusy(false);
                  }}
                  className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50"
                >
                  {g}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
            >
              Skip, play it safe
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
