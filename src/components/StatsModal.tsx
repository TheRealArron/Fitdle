'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { MAX_GUESSES } from '@/data/exercises';
import { useGameStore, selectWinRate } from '@/store/useGameStore';
import { Countdown } from './Countdown';
import { Modal } from './Modal';

interface StatsModalProps {
  open: boolean;
  onClose: () => void;
}

export function StatsModal({ open, onClose }: StatsModalProps) {
  const save = useGameStore((s) => s.save);
  const winRate = useGameStore(selectWinRate);
  const guesses = useGameStore((s) => s.guesses);
  const status = useGameStore((s) => s.status);
  const resetProgress = useGameStore((s) => s.resetProgress);
  const [confirming, setConfirming] = useState(false);

  const highlightRow = status === 'won' ? guesses.length : -1;
  const peak = Math.max(1, ...save.distribution);

  const cells = [
    { label: 'Played', value: save.played },
    { label: 'Win %', value: winRate },
    { label: 'Streak', value: save.streak },
    { label: 'Max', value: save.maxStreak },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Statistics">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-1">
              <span className="font-game text-2xl font-bold text-white tabular-nums">{c.value}</span>
              <span className="text-center text-[11px] uppercase leading-tight tracking-wider text-slate-500">
                {c.label}
              </span>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Guess distribution
          </h3>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: MAX_GUESSES }, (_, i) => {
              const count = save.distribution[i] ?? 0;
              const highlighted = i + 1 === highlightRow;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 shrink-0 font-game text-xs text-slate-400">{i + 1}</span>
                  <div className="flex-1">
                    <div
                      className={[
                        'flex h-6 min-w-6 items-center justify-end rounded px-2 font-game text-xs font-bold text-white transition-all',
                        highlighted ? 'bg-state-correct' : 'bg-slate-700',
                      ].join(' ')}
                      style={{ width: `${Math.max(8, (count / peak) * 100)}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <Countdown />
          {confirming ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  resetProgress();
                  setConfirming(false);
                  onClose();
                }}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
              >
                Erase everything
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-rose-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset statistics
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
