'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { REGIONS_IN_GROUP, type MuscleRegion } from '@/data/muscles';
import { getDailySeed } from '@/lib/daily';
import { accumulateMuscleFeedback } from '@/lib/muscleFeedback';
import { useGameStore, selectHints, revealedCount } from '@/store/useGameStore';
import { BodyFigure } from './BodyFigure';
import { ExerciseIndex } from './ExerciseIndex';
import { Grid } from './Grid';
import { Header } from './Header';
import { HelpModal } from './HelpModal';
import { HintBar } from './HintBar';
import { Keyboard } from './Keyboard';
import { ResultModal } from './ResultModal';
import { StatsModal } from './StatsModal';
import { Toast } from './Toast';

const EMPTY: ReadonlySet<MuscleRegion> = new Set();

export function Game() {
  const initGame = useGameStore((s) => s.initGame);
  const hydrated = useGameStore((s) => s.hydrated);
  const clockRollback = useGameStore((s) => s.clockRollback);

  const guesses = useGameStore((s) => s.guesses);
  const revealingRow = useGameStore((s) => s.revealingRow);
  const target = useGameStore((s) => s.target);
  const wordLength = useGameStore((s) => s.wordLength);
  const hints = useGameStore(useShallow(selectHints));

  const [statsOpen, setStatsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // A tab left open across midnight UTC would keep serving yesterday's word.
  useEffect(() => {
    const id = setInterval(() => {
      if (useGameStore.getState().seed !== getDailySeed()) initGame();
    }, 60_000);
    return () => clearInterval(id);
  }, [initGame]);

  /*
   * Derived with useMemo rather than a store selector on purpose: this returns
   * fresh Sets every call, and Zustand v5 compares snapshots by reference —
   * a selector would re-render forever. `guesses` is a stable array reference.
   */
  const feedback = useMemo(
    () => accumulateMuscleFeedback(guesses.slice(0, revealedCount({ guesses, revealingRow })), target),
    [guesses, revealingRow, target],
  );

  const categoryRegions = useMemo(
    () => (hints.category ? new Set(REGIONS_IN_GROUP[hints.category]) : EMPTY),
    [hints.category],
  );

  return (
    <div className="flex h-dvh flex-col items-center overflow-hidden">
      <Header
        onOpenStats={() => setStatsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenIndex={() => setIndexOpen(true)}
      />

      {clockRollback && (
        <div className="flex w-full max-w-lg items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>Your clock is behind a date you have already played — no streak credit today.</span>
        </div>
      )}

      <main
        className={[
          'flex w-full min-h-0 flex-1 flex-col items-center gap-2 overflow-hidden px-2 py-2',
          // Side by side only once there is width to spare. On a phone a 9-wide
          // grid and the figure cannot share a row without crushing both.
          'lg:flex-row lg:items-center lg:justify-center lg:gap-8',
          'transition-opacity duration-200',
        ].join(' ')}
        style={{ opacity: hydrated ? 1 : 0 }}
      >
        {/*
          The figure is the second feedback channel, so it stays on screen while
          you type rather than hiding in a modal.
        */}
        <BodyFigure
          shared={feedback.shared}
          missed={feedback.missed}
          category={categoryRegions}
          className={[
            'w-auto shrink-0',
            'h-[21vh] max-h-52',
            // A 600px-tall extension popup has no height to spare; give it back
            // to the board, which is the thing you cannot play without.
            '[@media(max-height:700px)]:h-[14vh]',
            'lg:h-auto lg:max-h-[62vh] lg:w-48',
          ].join(' ')}
        />

        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 lg:h-full lg:w-auto lg:flex-1">
          {/* Size container — see .board-area in globals.css. */}
          <div className="board-area flex min-h-0 w-full flex-1 items-center justify-center">
            <div
              style={{
                // 0.94 absorbs the inter-tile gaps, which the ratio ignores.
                width: `min(100cqw, calc(100cqh * ${wordLength} / 6 * 0.94))`,
                maxWidth: '30rem',
              }}
            >
              <Grid />
            </div>
          </div>
          <HintBar />
        </div>
      </main>

      <div className="flex w-full shrink-0 justify-center pb-3 pt-1">
        <Keyboard />
      </div>

      <Toast />
      <ResultModal />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExerciseIndex open={indexOpen} onClose={() => setIndexOpen(false)} />
    </div>
  );
}
