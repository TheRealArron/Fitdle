'use client';

import {
  ChartColumn,
  CircleHelp,
  CircleUser,
  Dumbbell,
  Flame,
  List,
  Shuffle,
  Trophy,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, getExercise } from '@/data/exercises';
import { getPuzzleNumber } from '@/lib/daily';
import { useGameStore, selectWinRate } from '@/store/useGameStore';
import { Countdown } from './Countdown';
import { MuscleLegend } from './MuscleLegend';

export interface SidebarActions {
  onOpenHelp: () => void;
  onOpenIndex: () => void;
  onOpenStats: () => void;
  onOpenAccount: () => void;
  /** Fired after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /**
   * The desktop rail sits opposite the figure, which carries its own key.
   * Only the drawer — where no figure rail exists — needs to repeat it.
   */
  showLegend?: boolean;
}

function NavItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-state-correct" />
      <span className="flex-1">{label}</span>
      {hint && <span className="font-game text-[11px] text-slate-600">{hint}</span>}
    </button>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white/5 py-2">
      <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
      <span className="font-game text-lg font-bold leading-none text-white tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

export function Sidebar({
  onOpenHelp,
  onOpenIndex,
  onOpenStats,
  onOpenAccount,
  onNavigate,
  showLegend = false,
}: SidebarActions) {
  const save = useGameStore((s) => s.save);
  const winRate = useGameStore(selectWinRate);
  const seed = useGameStore((s) => s.seed);
  const hydrated = useGameStore((s) => s.hydrated);
  const mode = useGameStore((s) => s.mode);
  const status = useGameStore((s) => s.status);
  const guesses = useGameStore((s) => s.guesses);
  const revealingRow = useGameStore((s) => s.revealingRow);
  const startPractice = useGameStore((s) => s.startPractice);
  const exitPractice = useGameStore((s) => s.exitPractice);

  // Hide the row still mid-flip so the history cannot spoil the reveal.
  const shown = revealingRow === null ? guesses : guesses.slice(0, revealingRow);

  const go = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <section>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {mode === 'practice' ? 'Practice' : 'Today'}
        </p>
        <p className="font-game text-lg font-bold text-white">
          {mode === 'practice' ? 'Free play' : `Puzzle #${getPuzzleNumber(seed)}`}
        </p>
        {mode === 'daily' && <Countdown />}
      </section>

      {mode === 'practice' ? (
        <section className="flex flex-col gap-2 rounded-xl bg-state-present/10 p-3 ring-1 ring-inset ring-state-present/25">
          <p className="text-xs leading-relaxed text-yellow-200/90">
            Practice rounds are not recorded. Your streak and stats are untouched however this
            one ends.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={go(startPractice)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/15"
            >
              <Shuffle className="h-3.5 w-3.5" />
              New
            </button>
            <button
              type="button"
              onClick={go(exitPractice)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/15"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Today
            </button>
          </div>
        </section>
      ) : (
        hydrated && (
          <section className="grid grid-cols-3 gap-2">
            <Stat icon={Flame} value={save.streak} label="Streak" />
            <Stat icon={Trophy} value={save.maxStreak} label="Best" />
            <Stat icon={ChartColumn} value={`${winRate}%`} label="Win" />
          </section>
        )
      )}

      <nav className="flex flex-col gap-0.5">
        <NavItem icon={CircleHelp} label="How to play" onClick={go(onOpenHelp)} />
        <NavItem
          icon={List}
          label="Exercise list"
          hint={String(CATALOGUE.length)}
          onClick={go(onOpenIndex)}
        />
        <NavItem icon={ChartColumn} label="Statistics" onClick={go(onOpenStats)} />
        {mode === 'daily' && (
          <NavItem
            icon={Shuffle}
            label="Practice mode"
            // Offered most prominently once today's puzzle is done, which is
            // exactly when a daily game usually just ends.
            hint={status === 'playing' ? undefined : 'free'}
            onClick={go(startPractice)}
          />
        )}
        <NavItem icon={CircleUser} label="Account & backup" onClick={go(onOpenAccount)} />
      </nav>

      {/*
        Guess history with real names. Doubles as the teaching payoff: you type
        CALFRAISE, and the sidebar tells you that is a Calf Raise hitting Legs.
      */}
      {shown.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Your guesses
          </h3>
          <ol className="flex flex-col gap-1">
            {shown.map((name, i) => {
              const e = getExercise(name);
              return (
                <li
                  key={name}
                  className="flex items-baseline gap-2 rounded-md bg-white/5 px-2 py-1.5"
                >
                  <span className="font-game text-[10px] text-slate-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-game text-xs font-bold tracking-wider text-white">
                      {name}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {e ? `${e.display} · ${e.group}` : '—'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {showLegend && (
        <section className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-4">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <Dumbbell className="h-3 w-3" aria-hidden />
            Muscle key
          </h3>
          <MuscleLegend />
          <p className="text-[10px] leading-relaxed text-slate-600">
            The figure only reacts to muscles your guesses have touched.
          </p>
        </section>
      )}
    </div>
  );
}
