'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATALOGUE, exercisesOfLength, type Exercise } from '@/data/exercises';
import { GROUP_ORDER, type MuscleGroup } from '@/data/muscles';
import { useGameStore } from '@/store/useGameStore';
import { Modal } from './Modal';

interface ExerciseIndexProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The fix for "players will never know what to guess".
 *
 * Wordle works because every player already carries the answer space in their
 * head - common English. Nobody carries a list of exercise names, so the game
 * has to hand it over. This is the full vocabulary, defaulting to today's
 * length so it doubles as the candidate list for the puzzle in front of you.
 */
export function ExerciseIndex({ open, onClose }: ExerciseIndexProps) {
  const wordLength = useGameStore((s) => s.wordLength);
  const guesses = useGameStore((s) => s.guesses);
  const [todayOnly, setTodayOnly] = useState(true);
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const pool = todayOnly ? exercisesOfLength(wordLength) : CATALOGUE;
    const q = query.trim().toUpperCase();
    const filtered = q
      ? pool.filter((e) => e.name.includes(q) || e.display.toUpperCase().includes(q))
      : pool;

    const byGroup = new Map<MuscleGroup, Exercise[]>();
    for (const e of filtered) {
      const bucket = byGroup.get(e.group) ?? [];
      bucket.push(e);
      byGroup.set(e.group, bucket);
    }
    for (const bucket of byGroup.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));

    return GROUP_ORDER.filter((g) => byGroup.has(g)).map(
      (g) => [g, byGroup.get(g)!] as const,
    );
  }, [todayOnly, wordLength, query]);

  const count = list.reduce((n, [, items]) => n + items.length, 0);

  return (
    <Modal open={open} onClose={onClose} title="Exercise list">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate-400">
          Every exercise you can type. Names are letters only - no spaces or hyphens, and
          singular. Pull-ups is <span className="font-game text-slate-200">PULLUP</span>.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTodayOnly(true)}
            className={[
              'flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              todayOnly
                ? 'bg-state-correct text-white'
                : 'bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10 hover:bg-white/10',
            ].join(' ')}
          >
            Today ({wordLength} letters)
          </button>
          <button
            type="button"
            onClick={() => setTodayOnly(false)}
            className={[
              'flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              !todayOnly
                ? 'bg-state-correct text-white'
                : 'bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10 hover:bg-white/10',
            ].join(' ')}
          >
            All {CATALOGUE.length}
          </button>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter exercises"
            className="w-full rounded-lg bg-white/5 py-2 pl-9 pr-3 text-sm text-white ring-1 ring-inset ring-white/10 outline-none placeholder:text-slate-500 focus:ring-state-correct/50"
          />
        </label>

        <div className="flex flex-col gap-4">
          {list.map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                {group}
              </h3>
              <div className="flex flex-col gap-1">
                {items.map((e) => {
                  const used = guesses.includes(e.name);
                  return (
                    <div
                      key={e.name}
                      className={[
                        'flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm',
                        used ? 'bg-white/5 opacity-45' : '',
                      ].join(' ')}
                    >
                      <span className="font-game font-bold tracking-wider text-white">
                        {e.name}
                        {used && <span className="ml-2 text-[11px] text-slate-500">guessed</span>}
                      </span>
                      <span className="truncate text-right text-xs text-slate-400">
                        {e.display}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {count === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Nothing matches that.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
