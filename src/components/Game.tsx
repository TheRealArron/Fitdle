'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { REGIONS_IN_GROUP, type MuscleRegion } from '@/data/muscles';
import { getDailySeed } from '@/lib/daily';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useGameStore, selectHints } from '@/store/useGameStore';
import { AccountModal } from './AccountModal';
import { BodyFigure } from './BodyFigure';
import { DrillModal } from './DrillModal';
import { GuideModal } from './GuideModal';
import { LeaderboardModal } from './LeaderboardModal';
import { ExerciseIndex } from './ExerciseIndex';
import { Grid } from './Grid';
import { Header } from './Header';
import { HelpModal } from './HelpModal';
import { HintBar } from './HintBar';
import { Keyboard } from './Keyboard';
import { MuscleDetail } from './MuscleDetail';
import { MuscleLegend } from './MuscleLegend';
import { OpeningCall } from './OpeningCall';
import { PostGamePanel, PracticeBar } from './PostGamePanel';
import { ResultModal } from './ResultModal';
import { SettingsModal } from './SettingsModal';
import { Sidebar } from './Sidebar';
import { StatsModal } from './StatsModal';
import { Toast } from './Toast';

const EMPTY: ReadonlySet<MuscleRegion> = new Set();

/**
 * Desktop is a three-column rail: menu | board | figure.
 *
 * The side rails are deliberately the SAME width. An asymmetric layout would
 * push the board off the viewport centre while the header and keyboard stayed
 * centred on it, and that mismatch is what reads as "broken alignment" - it was
 * the bug in the previous version, where the board lived in a flex-1 column
 * beside a fixed-width figure and centred itself within that column instead.
 *
 * Both rails appear together at `xl` or not at all, so the board is either
 * exactly centred or full-width. There is no in-between state where only one
 * rail is mounted.
 */
const RAIL = 'w-[23%] min-w-[17rem] max-w-[30rem] shrink-0';

export function Game() {
  const initGame = useGameStore((s) => s.initGame);
  const hydrated = useGameStore((s) => s.hydrated);
  const clockRollback = useGameStore((s) => s.clockRollback);

  const revealingRow = useGameStore((s) => s.revealingRow);
  const target = useGameStore((s) => s.reveal);
  const wordLength = useGameStore((s) => s.wordLength);
  const gameStatus = useGameStore((s) => s.status);
  const mode = useGameStore((s) => s.mode);
  const modalOpen = useGameStore((s) => s.modalOpen);
  const setModalOpen = useGameStore((s) => s.setModalOpen);
  const muscles = useGameStore((s) => s.muscles);
  const hints = useGameStore(useShallow(selectHints));

  /*
   * The figure must not light up before the row finishes flipping. The server
   * sends the new overlap with the guess response, so the previous value is
   * kept and shown until the animation completes.
   */
  /*
   * Adjusted during render, not in an effect - React's documented pattern for
   * "state derived from a prop change". An effect would paint the new map for
   * one frame before correcting itself, which is the flicker this exists to
   * prevent; a ref would be impure. Setting state here re-renders before paint.
   */
  const [previousMuscles, setPreviousMuscles] = useState(muscles);
  const [lastRevealing, setLastRevealing] = useState(revealingRow);
  if (lastRevealing !== revealingRow) {
    setLastRevealing(revealingRow);
    if (revealingRow === null) setPreviousMuscles(muscles);
  }

  /*
   * The daily is over AND the player has dismissed the result. Practice is
   * excluded: it has its own between-rounds bar, and the daily post-game panel
   * would wrongly imply the round counted for something.
   */
  const showPostGame =
    mode === 'daily' && gameStatus !== 'playing' && !modalOpen && revealingRow === null;

  const [statsOpen, setStatsOpen] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [region, setRegion] = useState<MuscleRegion | null>(null);

  const initAuth = useAuthStore((s) => s.init);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    initGame();
    // Restores a Supabase session if one exists and pulls the cloud save. A
    // no-op when the project has no keys.
    initAuth();
    // Client-only: reads localStorage and stamps <html> attributes.
    loadSettings();

  }, [initGame, initAuth, loadSettings]);

  // A tab left open across midnight UTC would keep serving yesterday's word.
  useEffect(() => {
    const id = setInterval(() => {
      const s = useGameStore.getState();
      if (s.mode === 'daily' && s.seed !== getDailySeed()) initGame();
    }, 60_000);
    return () => clearInterval(id);
  }, [initGame]);

  /*
   * Muscle feedback is computed by the SERVER and arrives with each response -
   * the client cannot derive it any more, because deriving it needs the answer.
   *
   * Still wrapped in useMemo: these are Sets built from arrays, so a bare
   * selector would return a new reference every render and Zustand v5 compares
   * by reference. Held back during a flip so the figure cannot outrun the tiles.
   */
  const feedback = useMemo(() => {
    const settled = revealingRow === null;
    return {
      shared: new Set(settled ? muscles.shared : previousMuscles.shared),
      missed: new Set(settled ? muscles.missed : previousMuscles.missed),
    };
  }, [muscles, previousMuscles, revealingRow]);

  const categoryRegions = useMemo(
    () => (hints.category ? new Set(REGIONS_IN_GROUP[hints.category]) : EMPTY),
    [hints.category],
  );

  /*
   * Derived, not stored. The server banks the result as the round ends, so the
   * board is stale the moment the status changes - and a value computed from
   * that status says so without an effect that re-renders to announce it.
   */
  const boardKey = `${mode}:${gameStatus}`;

  const sidebarActions = {
    onOpenHelp: () => setHelpOpen(true),
    onOpenIndex: () => setIndexOpen(true),
    onOpenStats: () => setStatsOpen(true),
    onOpenDrill: () => setDrillOpen(true),
    onOpenBoard: () => setBoardOpen(true),
    onOpenGuide: () => setGuideOpen(true),
    onOpenAccount: () => setAccountOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
  };

  // Tapping a muscle is a post-round feature: mid-round it narrows the answer.
  const roundOver = gameStatus !== 'playing';

  const figure = (
    <BodyFigure
      shared={feedback.shared}
      missed={feedback.missed}
      category={categoryRegions}
      className="h-auto w-full"
      onSelectRegion={roundOver ? (r) => setRegion((cur) => (cur === r ? null : r)) : undefined}
      selectHint="show what else trains it"
      selected={roundOver ? region : null}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header onOpenMenu={() => setDrawerOpen(true)} onOpenStats={() => setStatsOpen(true)} />

      {clockRollback && (
        <div className="flex w-full shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>Your clock is behind a date you have already played - no streak credit today.</span>
        </div>
      )}

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {/* Left rail - menu. */}
        <aside className={`hidden border-r border-white/10 xl:block ${RAIL}`}>
          <Sidebar {...sidebarActions} />
        </aside>

        {/* Centre - board, hints, keyboard. */}
        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col items-center transition-opacity duration-200"
          style={{ opacity: hydrated ? 1 : 0 }}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-hidden px-2 py-2">
            {/* Below xl the figure has no rail, so it sits above the board. */}
            <BodyFigure
              shared={feedback.shared}
              missed={feedback.missed}
              category={categoryRegions}
              className="h-[21vh] max-h-52 w-auto shrink-0 [@media(max-height:700px)]:h-[14vh] xl:hidden"
            />

            {/*
              Size container - see .board-area in globals.css. The hint chips
              live inside the centred group rather than after it, so they stay
              attached to the board instead of drifting to the bottom of a tall
              viewport. The 3.5rem term reserves their row in the height budget.
            */}
            <div className="board-area flex min-h-0 w-full flex-1 items-center justify-center">
              <div className="flex w-full flex-col items-center gap-4">
                <div
                  className="w-full"
                  style={{
                    // 0.94 absorbs the inter-tile gaps, which the ratio ignores.
                    width: `min(100cqw, calc((100cqh - 3.5rem) * ${wordLength} / 6 * 0.94))`,
                    // Upper bound so tiles stay a sane size on very tall screens
                    // rather than the board ballooning to fill the rail height.
                    maxWidth: '38rem',
                  }}
                >
                  <Grid />
                </div>
                {showPostGame ? null : (
                  <>
                    <HintBar />
                    <OpeningCall />
                  </>
                )}
              </div>
            </div>
          </div>

          {/*
            Once the day is done the keyboard is dead weight, so it is replaced
            by the thing a finished player actually wants next. In practice mode
            the board stays live between rounds, so only a compact bar appears.
          */}
          <div className="flex w-full shrink-0 justify-center px-3 pb-3 pt-1">
            {showPostGame ? (
              <PostGamePanel
                onOpenStats={() => setStatsOpen(true)}
                onReopenResult={() => setModalOpen(true)}
              />
            ) : mode === 'practice' && gameStatus !== 'playing' ? (
              <PracticeBar />
            ) : (
              <Keyboard />
            )}
          </div>
        </main>

        {/* Right rail - the muscle map, big enough to actually read. */}
        <aside
          className={`hidden flex-col items-center justify-center gap-5 border-l border-white/10 p-5 xl:flex ${RAIL}`}
        >
          {/* No width cap - the figure should use the whole rail. */}
          <div className="w-full">{figure}</div>
          <MuscleDetail region={region} answer={target} onClose={() => setRegion(null)} />
          {!region && (
            <p className="text-center text-xs leading-snug text-slate-500">
              {roundOver
                ? 'Tap a muscle to see what else trains it.'
                : 'Muscle details unlock when the round ends.'}
            </p>
          )}
          <MuscleLegend className="w-full max-w-[13rem]" detailed />
        </aside>
      </div>

      {/* Mobile / tablet drawer for the same menu. */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex xl:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="relative flex h-full w-[19rem] max-w-[85vw] flex-col border-r border-white/10 bg-slate-900 shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar
                {...sidebarActions}
                onNavigate={() => setDrawerOpen(false)}
                showLegend
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast />
      <ResultModal />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <DrillModal open={drillOpen} onClose={() => setDrillOpen(false)} />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <LeaderboardModal
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        refreshKey={boardKey}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExerciseIndex open={indexOpen} onClose={() => setIndexOpen(false)} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
