'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Loader2, Target, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
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

export function Leaderboard({ refreshKey = '' }: { refreshKey?: string }) {
  const [which, setWhich] = useState<Which>('streak');
  /*
   * One state value carrying which request it answers, so `loading` is DERIVED
   * rather than stored. Storing it meant setting it synchronously inside the
   * effect, which re-renders just to say "I am about to fetch" - and the result
   * still has to be compared against the current tab anyway, or a slow response
   * for the streaks board can land after you have switched to today's.
   */
  const [result, setResult] = useState<
    { for: string; data: LeaderboardResponse | null; error: string | null } | null
  >(null);
  const user = useAuthStore((s) => s.user);

  const request = `${which}:${refreshKey}`;
  const loading = result?.for !== request;
  const data = loading ? null : result.data;
  const error = loading ? null : result.error;

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchBoard(which);
      // Only the newest request may write; an earlier one resolving late must
      // not overwrite it.
      if (!live) return;
      setResult({
        for: request,
        data: r.ok ? r.data : null,
        error: r.ok ? null : r.error,
      });
    })();
    return () => {
      live = false;
    };
  }, [which, request]);

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

      <p className="text-xs leading-snug text-slate-500">
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
                  <span className="ml-1 text-xs font-normal text-slate-400">
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
        <p className="text-xs leading-snug text-slate-500">
          Sign in to appear on the board. Only the name you choose is ever shown.
        </p>
      ) : null}
    </div>
  );
}
