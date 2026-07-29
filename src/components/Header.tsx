'use client';

import { ChartColumn, CircleHelp, Dumbbell, Flame, List } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';

interface HeaderProps {
  onOpenStats: () => void;
  onOpenHelp: () => void;
  onOpenIndex: () => void;
}

export function Header({ onOpenStats, onOpenHelp, onOpenIndex }: HeaderProps) {
  const streak = useGameStore((s) => s.streak);
  const hydrated = useGameStore((s) => s.hydrated);

  return (
    <header className="flex w-full max-w-lg shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="How to play"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <CircleHelp className="h-5 w-5" />
        </button>
        {/* The exercise list is load-bearing, not a nicety — players cannot be
            expected to know the vocabulary the way they know English. */}
        <button
          type="button"
          onClick={onOpenIndex}
          aria-label="Exercise list"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <List className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Dumbbell className="h-5 w-5 text-state-correct" aria-hidden />
        <h1 className="font-game text-xl font-bold uppercase tracking-[0.2em] text-white">
          Fitdle
        </h1>
      </div>

      <div className="flex items-center gap-1">
        {/* Rendered only after hydration — the streak comes from localStorage. */}
        {hydrated && streak > 0 && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 font-game text-xs font-bold text-orange-300"
            aria-label={`${streak} day streak`}
          >
            <Flame className="h-3.5 w-3.5" />
            {streak}
          </motion.span>
        )}
        <button
          type="button"
          onClick={onOpenStats}
          aria-label="Statistics"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChartColumn className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
