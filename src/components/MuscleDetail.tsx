'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { CATALOGUE, type Exercise } from '@/data/exercises';
import { MUSCLE_LABEL, type MuscleRegion } from '@/data/muscles';

interface MuscleDetailProps {
  region: MuscleRegion | null;
  /**
   * Always supplied, even mid-game — it is needed to EXCLUDE the answer from
   * the suggestion lists. Whether it may be described is `revealed`.
   */
  answer: Exercise;
  /** True once the round is over and the answer is public. */
  revealed: boolean;
  onClose: () => void;
}

/**
 * What you get for tapping a muscle.
 *
 * Two jobs. During play it answers "what else hits this?", which is a genuine
 * strategic aid — knowing three other exercises that work the lats tells you
 * what to probe next. After the game it becomes the teaching payoff, naming
 * whether the answer worked that muscle and why.
 *
 * It never names the answer while the game is live. `worksIt` is null until the
 * round is over precisely so this panel cannot become an oracle.
 */
export function MuscleDetail({ region, answer, revealed, onClose }: MuscleDetailProps) {
  /*
   * The answer is filtered out of BOTH lists at all times, not just once it is
   * revealed.
   *
   * This was a real leak: today's answer was BURPEE, which works the abs as an
   * assistor, so tapping "Abs" mid-game listed BURPEE under "also involves it".
   * A player could tap around the figure and read the answer straight off the
   * suggestions. Excluding it always costs nothing — the lists are capped
   * anyway, so nobody can tell one entry is missing.
   */
  const others = useMemo(() => {
    if (!region) return [];
    return CATALOGUE.filter((e) => e.primary.includes(region) && e.name !== answer.name).slice(0, 4);
  }, [region, answer]);

  const assists = useMemo(() => {
    if (!region) return [];
    return CATALOGUE.filter(
      (e) => e.secondary.includes(region) && !e.primary.includes(region) && e.name !== answer.name,
    ).slice(0, 3);
  }, [region, answer]);

  const worksIt =
    revealed && region
      ? answer.primary.includes(region) || answer.secondary.includes(region)
      : null;

  return (
    <AnimatePresence>
      {region && (
        <motion.div
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 4, height: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="w-full overflow-hidden"
        >
          <div className="panel-raised rounded-xl p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-white">{MUSCLE_LABEL[region]}</h4>
                {worksIt !== null && (
                  <p
                    className={`text-[11px] leading-snug ${
                      worksIt ? 'text-state-correct' : 'text-slate-500'
                    }`}
                  >
                    {worksIt
                      ? `${answer.display} works this${
                          answer.primary.includes(region) ? ' as a prime mover' : ' as an assistor'
                        }.`
                      : `${answer.display} does not work this.`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close muscle detail"
                className="-m-1 shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {others.length > 0 && (
              <div className="mb-2">
                <p className="label mb-1 text-[9px]">Trains it directly</p>
                <div className="flex flex-wrap gap-1">
                  {others.map((e) => (
                    <span
                      key={e.name}
                      title={e.display}
                      className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-game text-[10px] font-bold text-slate-200"
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {assists.length > 0 && (
              <div>
                <p className="label mb-1 text-[9px]">Also involves it</p>
                <div className="flex flex-wrap gap-1">
                  {assists.map((e) => (
                    <span
                      key={e.name}
                      title={e.display}
                      className="rounded-md bg-white/[0.03] px-1.5 py-0.5 font-game text-[10px] text-slate-400"
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {others.length === 0 && assists.length === 0 && (
              <p className="text-[11px] text-slate-500">
                Nothing in the list targets this directly.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
