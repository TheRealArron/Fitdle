'use client';

import { motion } from 'framer-motion';
import { ChartColumn, CirclePlay, Share2, Shuffle, Trophy, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { MAX_GUESSES } from '@/data/exercises';
import { buildShareText, shareResult } from '@/lib/share';
import { useGameStore } from '@/store/useGameStore';
import { Countdown } from './Countdown';

interface PostGamePanelProps {
  onOpenStats: () => void;
  onReopenResult: () => void;
}

/**
 * Replaces the board once the day is finished and the result modal is dismissed.
 *
 * Without this the player is left staring at a dead board with a keyboard that
 * does nothing — the single most common complaint about daily word games. The
 * obvious next action (another round) is offered right here, and it is a
 * practice round, so nothing on offer can affect the streak.
 */
export function PostGamePanel({ onOpenStats, onReopenResult }: PostGamePanelProps) {
  const status = useGameStore((s) => s.status);
  const target = useGameStore((s) => s.target);
  const guesses = useGameStore((s) => s.guesses);
  const evaluations = useGameStore((s) => s.evaluations);
  const streak = useGameStore((s) => s.streak);
  const seed = useGameStore((s) => s.seed);
  const startPractice = useGameStore((s) => s.startPractice);
  const setToast = useGameStore((s) => s.setToast);
  const [sharing, setSharing] = useState(false);

  const won = status === 'won';

  const onShare = async () => {
    setSharing(true);
    const outcome = await shareResult(buildShareText(seed, evaluations, won, streak));
    setSharing(false);
    setToast(
      outcome === 'shared'
        ? 'Shared'
        : outcome === 'copied'
          ? 'Result copied to clipboard'
          : 'Could not share — copy manually',
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
      className="panel flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/[0.08] p-5"
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            won
              ? 'bg-state-correct/15 text-state-correct ring-1 ring-inset ring-state-correct/30'
              : 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/25',
          ].join(' ')}
        >
          <Trophy className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="label">{won ? 'Solved' : "Today's answer"}</p>
          <p className="truncate font-game text-lg font-bold tracking-wide text-white">
            {target.name}
          </p>
        </div>
        <span className="numeric ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-slate-300 ring-1 ring-inset ring-white/10">
          {won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
        </span>
      </div>

      <div className="border-t border-white/[0.07] pt-4">
        <Countdown />
      </div>

      <div className="flex flex-col gap-2">
        {/* Primary action: the thing a finished player actually wants. */}
        <button type="button" onClick={startPractice} className="btn btn-primary w-full">
          <Shuffle className="h-4 w-4" />
          Play a practice round
        </button>
        <p className="-mt-1 text-center text-[11px] leading-snug text-slate-500">
          Unlimited, random, and never counted — your streak is safe.
        </p>

        <div className="mt-1 grid grid-cols-3 gap-2">
          <button type="button" onClick={onShare} disabled={sharing} className="btn btn-ghost">
            <Share2 className="h-4 w-4" />
            <span className="text-xs">Share</span>
          </button>
          <button type="button" onClick={onOpenStats} className="btn btn-ghost">
            <ChartColumn className="h-4 w-4" />
            <span className="text-xs">Stats</span>
          </button>
          <button type="button" onClick={onReopenResult} className="btn btn-ghost">
            <CirclePlay className="h-4 w-4" />
            <span className="text-xs">Form</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** Shown while in a practice round, so returning to the daily is always one click. */
export function PracticeBar() {
  const startPractice = useGameStore((s) => s.startPractice);
  const exitPractice = useGameStore((s) => s.exitPractice);
  const status = useGameStore((s) => s.status);

  if (status === 'playing') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full max-w-sm gap-2"
    >
      <button type="button" onClick={startPractice} className="btn btn-primary flex-1">
        <Shuffle className="h-4 w-4" />
        Another round
      </button>
      <button type="button" onClick={exitPractice} className="btn btn-ghost flex-1">
        <Undo2 className="h-4 w-4" />
        Back to today
      </button>
    </motion.div>
  );
}
