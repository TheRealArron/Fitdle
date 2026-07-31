'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Filter, List, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_HINT_AT } from '@/data/exercises';
import { answersOfLength, possibleAnswers } from '@/lib/candidates';
import { useGameStore, revealedCount } from '@/store/useGameStore';

/**
 * Today's shortlist, unlocked once you have spent your two blind guesses.
 *
 * The full exercise index is always available, but it is a reference work — 99
 * entries across five lengths. This is the opposite: only the words that could
 * actually be today's answer, and optionally only the ones still consistent
 * with every clue on the board.
 *
 * It unlocks at the same point as the muscle-group hint. Before that it would
 * hand over the answer space that the first two guesses are supposed to be
 * exploring, which is where the deduction lives.
 */
export function CandidatePanel({ onOpenIndex }: { onOpenIndex: () => void }) {
  const guesses = useGameStore((s) => s.guesses);
  const evaluations = useGameStore((s) => s.evaluations);
  const revealingRow = useGameStore((s) => s.revealingRow);
  const wordLength = useGameStore((s) => s.wordLength);
  const status = useGameStore((s) => s.status);

  const [open, setOpen] = useState(false);
  /*
   * Defaults to the plain list, not the filtered one.
   *
   * With 12 answers per length, "still possible" routinely collapses to a
   * single word after two guesses — it is a solver, not a hint. Opening the
   * panel should show you today's candidates; narrowing them is a separate,
   * deliberate click for when you are genuinely stuck.
   */
  const [onlyPossible, setOnlyPossible] = useState(false);

  // Never count a row that is still flipping — the panel must not spoil it.
  const revealed = revealedCount({ guesses, revealingRow });
  const unlocked = status !== 'playing' || revealed >= CATEGORY_HINT_AT - 1;

  const { all, possible } = useMemo(() => {
    const shown = guesses.slice(0, revealed);
    return {
      all: answersOfLength(wordLength),
      possible: possibleAnswers(shown, evaluations.slice(0, revealed), wordLength),
    };
  }, [guesses, evaluations, revealed, wordLength]);

  const list = onlyPossible ? possible : all;

  if (!unlocked) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="label">Today&apos;s shortlist</h3>
        <div className="panel-raised flex items-center gap-2.5 rounded-xl px-3 py-2.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
          <p className="text-[11px] leading-snug text-slate-500">
            Unlocks after guess {CATEGORY_HINT_AT - 1}. The first two are yours to work out.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg py-1 text-left transition-colors hover:text-white"
      >
        <h3 className="label flex-1">Today&apos;s shortlist</h3>
        <span className="numeric rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-slate-300">
          {list.length}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pb-1">
              {/* Narrowed vs everything: the toggle the whole panel hangs on. */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                <button
                  type="button"
                  onClick={() => setOnlyPossible(true)}
                  className={[
                    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                    onlyPossible ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  <Filter className="h-3 w-3" />
                  Still possible
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyPossible(false)}
                  className={[
                    'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                    !onlyPossible ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  All {all.length}
                </button>
              </div>

              <p className="text-[10px] leading-snug text-slate-600">
                {onlyPossible
                  ? `Only answers matching every clue on your board. This is a solver — it will often leave one word.`
                  : `Every answer that is ${wordLength} letters long. Guess-only words are not listed; they can never be the answer.`}
              </p>

              <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {list.map((a) => {
                  const used = guesses.includes(a.name);
                  return (
                    <li
                      key={a.name}
                      className={[
                        'flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5',
                        used ? 'opacity-40' : 'hover:bg-white/[0.04]',
                      ].join(' ')}
                    >
                      <span className="font-game text-[11px] font-bold tracking-wide text-white">
                        {a.name}
                      </span>
                      <span className="truncate text-right text-[10px] text-slate-500">
                        {used ? 'guessed' : a.display}
                      </span>
                    </li>
                  );
                })}
                {list.length === 0 && (
                  <li className="px-2 py-3 text-center text-[11px] text-slate-500">
                    Nothing matches every clue — check the board for a misread.
                  </li>
                )}
              </ul>

              <button
                type="button"
                onClick={onOpenIndex}
                className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
              >
                <List className="h-3.5 w-3.5" />
                Full exercise list
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
