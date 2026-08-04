'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { CATALOGUE } from '@/data/exercises';
import type { RevealedAnswer } from '@/lib/api';
import { MUSCLE_LABEL, type MuscleRegion } from '@/data/muscles';

interface MuscleDetailProps {
  region: MuscleRegion | null;
  /**
   * Null while a daily round is live — the browser genuinely does not know the
   * answer, because the server has not sent it. That is the safe state: there
   * is nothing to exclude and nothing to leak. Non-null once revealed (or in
   * practice, where the client scores locally).
   */
  answer: RevealedAnswer | null;
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
export function MuscleDetail({ region, answer, onClose }: MuscleDetailProps) {
  /*
   * When the answer IS known (post-game, or practice) it is excluded from both
   * lists, so the panel never restates what the modal already says.
   *
   * When it is not known — a live daily — nothing needs excluding, because the
   * client cannot identify which of these words is today's. This used to be a
   * real leak: the answer was filtered only once revealed, so tapping "Abs"
   * mid-game listed BURPEE outright. Moving the answer server-side removes the
   * leak at the source rather than patching the symptom.
   */
  const others = useMemo(() => {
    if (!region) return [];
    return CATALOGUE.filter((e) => e.primary.includes(region) && e.name !== answer?.name).slice(0, 4);
  }, [region, answer]);

  const assists = useMemo(() => {
    if (!region) return [];
    return CATALOGUE.filter(
      (e) => e.secondary.includes(region) && !e.primary.includes(region) && e.name !== answer?.name,
    ).slice(0, 3);
  }, [region, answer]);

  const worksIt =
    answer && region
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
                {worksIt !== null && answer && (
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
