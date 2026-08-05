'use client';

import {
  ChartColumn,
  CircleHelp,
  CloudCheck,
  CircleUser,
  Dumbbell,
  Flame,
  List,
  Settings,
  Shuffle,
  Trophy,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, getExercise } from '@/data/exercises';
import { getPuzzleNumber } from '@/lib/daily';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore, selectWinRate } from '@/store/useGameStore';
import { Countdown } from './Countdown';
import { MuscleLegend } from './MuscleLegend';

export interface SidebarActions {
  onOpenHelp: () => void;
  onOpenIndex: () => void;
  onOpenStats: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
  /** Fired after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /**
   * The desktop rail sits opposite the figure, which carries its own key.
   * Only the drawer - where no figure rail exists - needs to repeat it.
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
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-accent" />
      <span className="flex-1">{label}</span>
      {hint && <span className="numeric text-[11px] text-slate-600">{hint}</span>}
    </button>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number | string; label: string }) {
  return (
    <div className="panel-raised flex flex-col items-center gap-0.5 rounded-xl py-2.5">
      <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
      <span className="numeric text-lg font-bold leading-none text-white">{value}</span>
      <span className="label text-[9px]">{label}</span>
    </div>
  );
}

export function Sidebar({
  onOpenHelp,
  onOpenIndex,
  onOpenStats,
  onOpenAccount,
  onOpenSettings,
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
  const authUser = useAuthStore((s) => s.user);
  const cloudAvailable = useAuthStore((s) => s.cloudAvailable);

  // Hide the row still mid-flip so the history cannot spoil the reveal.
  const shown = revealingRow === null ? guesses : guesses.slice(0, revealingRow);

  const go = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <section>
        <p className="label">{mode === 'practice' ? 'Practice' : 'Today'}</p>
        <p className="numeric text-lg font-bold text-white">
          {mode === 'practice'
            ? 'Free play'
            : /* Date-derived: blank until the client has read the real clock. */
              hydrated
              ? `Puzzle #${getPuzzleNumber(seed)}`
              : '-'}
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
        <NavItem icon={Settings} label="Settings" onClick={go(onOpenSettings)} />
        {authUser ? (
          /* Signed in: show who, not what. The sync state is the useful detail. */
          <button
            type="button"
            onClick={go(onOpenAccount)}
            className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-dim font-game text-[10px] font-bold uppercase text-accent">
              {authUser.username.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {authUser.username}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <CloudCheck className="h-3 w-3" aria-hidden />
                Synced
              </span>
            </span>
          </button>
        ) : (
          <NavItem
            icon={CircleUser}
            label={cloudAvailable ? 'Sign in' : 'Account & backup'}
            onClick={go(onOpenAccount)}
          />
        )}
      </nav>

      {/*
        Guess history with real names. Doubles as the teaching payoff: you type
        CALFRAISE, and the sidebar tells you that is a Calf Raise hitting Legs.
      */}
      {shown.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="label">Your guesses</h3>
          <ol className="flex flex-col gap-1">
            {shown.map((name, i) => {
              const e = getExercise(name);
              return (
                <li
                  key={name}
                  className="panel-raised flex items-baseline gap-2 rounded-lg px-2.5 py-1.5"
                >
                  <span className="numeric text-[10px] text-slate-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-game text-xs font-bold tracking-wide text-white">
                      {name}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {e ? `${e.display} · ${e.group}` : '-'}
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
          <h3 className="label flex items-center gap-1.5">
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
