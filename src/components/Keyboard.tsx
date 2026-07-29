'use client';

import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { LetterState } from '@/lib/evaluate';
import { useGameStore, selectKeyStates } from '@/store/useGameStore';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

const KEY_CLASS: Record<LetterState, string> = {
  correct: 'bg-state-correct text-white',
  present: 'bg-state-present text-white',
  absent: 'bg-state-absent text-white/70',
};

export function Keyboard() {
  const addLetter = useGameStore((s) => s.addLetter);
  const removeLetter = useGameStore((s) => s.removeLetter);
  const submitGuess = useGameStore((s) => s.submitGuess);
  const modalOpen = useGameStore((s) => s.modalOpen);
  // `useShallow` is required: the selector derives a fresh object on every
  // call, and Zustand v5 compares snapshots by reference. Without it React
  // re-renders forever.
  const keyStates = useGameStore(useShallow(selectKeyStates));

  // Physical keyboard. Suspended while a modal owns the screen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modalOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        submitGuess();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        removeLetter();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        addLetter(e.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addLetter, removeLetter, submitGuess, modalOpen]);

  const press = (key: string) => {
    if (key === 'ENTER') submitGuess();
    else if (key === 'BACKSPACE') removeLetter();
    else addLetter(key);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-1.5 px-1" role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {/* Half-key indents keep the QWERTY stagger honest. */}
          {i === 1 && <div className="w-2 shrink-0 sm:w-3" aria-hidden />}
          {row.map((key) => {
            const wide = key === 'ENTER' || key === 'BACKSPACE';
            const state = keyStates[key];

            return (
              <motion.button
                key={key}
                type="button"
                onClick={() => press(key)}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.08 }}
                aria-label={key === 'BACKSPACE' ? 'Backspace' : key}
                className={[
                  'flex h-12 items-center justify-center rounded-md font-game text-sm font-bold uppercase',
                  'transition-colors duration-300 select-none sm:h-14 sm:text-base',
                  'active:brightness-90',
                  wide ? 'grow-[1.6] basis-0 text-xs sm:text-sm' : 'grow basis-0',
                  state ? KEY_CLASS[state] : 'bg-key-idle text-white hover:bg-key-hover',
                ].join(' ')}
              >
                {key === 'BACKSPACE' ? <Delete className="h-5 w-5" aria-hidden /> : key}
              </motion.button>
            );
          })}
          {i === 1 && <div className="w-2 shrink-0 sm:w-3" aria-hidden />}
        </div>
      ))}
    </div>
  );
}
