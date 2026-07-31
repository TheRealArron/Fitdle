'use client';

import { ChartColumn, Dumbbell, Flame, Menu, Shuffle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';

interface HeaderProps {
  onOpenMenu: () => void;
  onOpenStats: () => void;
}

export function Header({ onOpenMenu, onOpenStats }: HeaderProps) {
  const streak = useGameStore((s) => s.streak);
  const hydrated = useGameStore((s) => s.hydrated);
  const mode = useGameStore((s) => s.mode);

  return (
    <header className="flex w-full shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-surface/40 px-3 py-3 backdrop-blur-sm">
      <div className="flex flex-1 items-center gap-1">
        {/* On xl the sidebar is always on screen, so the trigger disappears. */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white xl:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Dumbbell className="h-5 w-5 text-accent drop-shadow-[0_0_8px_rgba(52,211,153,0.55)]" aria-hidden />
        <h1 className="font-game text-xl font-bold uppercase tracking-[0.28em] text-white">
          Fitdle
        </h1>
        {mode === 'practice' && (
          <span className="flex items-center gap-1 rounded-full bg-state-present/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-300">
            <Shuffle className="h-3 w-3" />
            Practice
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        {hydrated && mode === 'daily' && streak > 0 && (
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
