'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Loader2, Target, Trophy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchBoard } from '@/lib/api';
import type { BoardEntry, BoardKind, LeaderboardResponse } from '@/lib/contracts';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Public boards.
 *
 * Everything shown here came from the server, which computed the ranks and
 * decided which row is yours. The client is given a name, a number and a
 * boolean per row - deliberately not enough to identify anybody, since a
 * leaderboard is exactly where someone would go to collect stable identifiers.
 */

type Which = BoardKind;

const TABS: ReadonlyArray<{ key: Which; label: string; icon: typeof Flame; unit: string }> = [
  { key: 'streak', label: 'Streaks', icon: Flame, unit: 'day' },
  { key: 'daily', label: 'Today', icon: Target, unit: 'guess' },
];

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [which, setWhich] = useState<Which>('streak');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  const load = useCallback(async (board: Which) => {
    setLoading(true);
    setError(null);
    const result = await fetchBoard(board);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setData(null);
      return;
    }
    setData(result.data);
  }, []);

  // `refreshKey` changes after a win, so the player watches their own name move
  // rather than having to reopen the panel.
  useEffect(() => {
    void load(which);
  }, [which, refreshKey, load]);

  const tab = TABS.find((t) => t.key === which)!;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={which === key}
            onClick={() => setWhich(key)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              which === key
                ? 'bg-white/[0.12] text-white'
                : 'bg-white/[0.04] text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-snug text-slate-500">
        {which === 'streak'
          ? 'Longest current streaks. Ties go to whoever got there first.'
          : "Everyone who solved today's puzzle, fewest guesses first."}
      </p>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center py-8"
          >
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </motion.div>
        ) : error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-8 text-center text-sm text-slate-400"
          >
            {error}
          </motion.p>
        ) : !data || data.top.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-8 text-center text-sm text-slate-400"
          >
            {which === 'daily'
              ? 'Nobody has solved it yet today. Be first.'
              : 'No streaks yet. Start one.'}
          </motion.p>
        ) : (
          <motion.ol
            key={which}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1"
          >
            {data.top.map((e: BoardEntry) => (
              <li
                key={`${e.rank}-${e.name}`}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                  e.isYou
                    ? 'bg-state-correct/15 text-white ring-1 ring-inset ring-state-correct/40'
                    : 'bg-white/[0.04] text-slate-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-6 shrink-0 text-right font-game text-xs font-bold tabular-nums',
                    e.rank <= 3 ? 'text-state-present' : 'text-slate-500',
                  ].join(' ')}
                >
                  {e.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {e.name}
                  {e.isYou ? <span className="ml-1.5 text-xs font-normal opacity-70">you</span> : null}
                </span>
                <span className="shrink-0 font-game text-sm font-bold tabular-nums">
                  {e.value}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    {which === 'streak' ? 'd' : `/6`}
                  </span>
                </span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>

      {/* Your standing, when you did not make the top ten. */}
      {data?.you ? (
        <div className="flex items-center gap-3 rounded-lg bg-state-correct/10 px-3 py-2 text-sm ring-1 ring-inset ring-state-correct/30">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-state-correct" />
          <span className="flex-1 text-slate-300">
            Your rank <strong className="text-white">#{data.you.rank.toLocaleString()}</strong>
            <span className="text-slate-500"> of {data.total.toLocaleString()}</span>
          </span>
          <span className="font-game text-sm font-bold text-white tabular-nums">
            {plural(data.you.value, tab.unit)}
          </span>
        </div>
      ) : null}

      {!user ? (
        <p className="text-[11px] leading-snug text-slate-500">
          Sign in to appear on the board. Only the name you choose is ever shown.
        </p>
      ) : null}
    </div>
  );
}
