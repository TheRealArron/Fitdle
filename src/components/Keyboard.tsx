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
  correct: 'bg-state-correct text-white shadow-[0_2px_10px_-2px_rgba(34,197,94,0.6)]',
  // Same dark-on-yellow pairing as the tiles; white on #eab308 fails contrast.
  present: 'on-present bg-state-present text-[#231a00] shadow-[0_2px_10px_-2px_rgba(234,179,8,0.5)]',
  // Eliminated keys recede rather than shout - they are the least useful thing
  // on screen once known, so they lose contrast instead of gaining a colour.
  absent: 'bg-state-absent/45 text-white/35',
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

      /*
       * Never take a key that belongs to something you are typing into.
       *
       * This listener is on `window`, so it fired for every keystroke anywhere
       * on the page - including inside the guide chat's input. Typing a
       * question there filled in the guess grid at the same time, and
       * Backspace was preventDefault()ed here so it never reached the input at
       * all: you could type into the chat but not correct a typo.
       *
       * Checking the event's origin rather than adding a flag per feature is
       * what makes this stay fixed. Any input added later - a username field,
       * a search box - inherits it without touching this file.
       */
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))
      ) {
        return;
      }

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
                  'flex h-12 items-center justify-center rounded-lg font-game text-sm font-bold uppercase',
                  'transition-colors duration-300 select-none sm:h-14 sm:text-base',
                  // Top-edge highlight matches .panel - the keys read as the
                  // same material as the rails rather than floating chips.
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
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
