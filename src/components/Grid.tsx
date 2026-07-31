'use client';

import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { MAX_GUESSES } from '@/data/exercises';
import { useGameStore } from '@/store/useGameStore';
import { Tile } from './Tile';

export function Grid() {
  const guesses = useGameStore((s) => s.guesses);
  const evaluations = useGameStore((s) => s.evaluations);
  const currentGuess = useGameStore((s) => s.currentGuess);
  const wordLength = useGameStore((s) => s.wordLength);
  const revealingRow = useGameStore((s) => s.revealingRow);
  const shakeRow = useGameStore((s) => s.shakeRow);
  const status = useGameStore((s) => s.status);
  const finishReveal = useGameStore((s) => s.finishReveal);
  const clearShake = useGameStore((s) => s.clearShake);

  useEffect(() => {
    if (shakeRow === null) return;
    const t = setTimeout(clearShake, 600);
    return () => clearTimeout(t);
  }, [shakeRow, clearShake]);

  const winningRow = status === 'won' ? guesses.length - 1 : -1;

  return (
    <div
      className="grid w-full grid-rows-6 gap-1.5"
      role="grid"
      aria-label={`Guess grid, ${wordLength} letters`}
    >
      {Array.from({ length: MAX_GUESSES }, (_, row) => {
        const submitted = row < guesses.length;
        const isCurrent = row === guesses.length;
        const word = submitted ? guesses[row] : isCurrent ? currentGuess : '';
        const evaluation = submitted ? evaluations[row] : null;

        const revealing = revealingRow === row;
        const settled = submitted && !revealing;
        const bouncing = row === winningRow && revealingRow === null;

        return (
          <motion.div
            key={row}
            role="row"
            className="grid gap-1.5"
            // Column count is per-day, so it cannot be a static Tailwind class.
            style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}
            animate={shakeRow === row ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            {Array.from({ length: wordLength }, (_, col) => (
              <Tile
                key={col}
                index={col}
                letter={word[col] ?? ''}
                state={evaluation?.[col] ?? null}
                revealing={revealing}
                settled={settled}
                bouncing={bouncing}
                // Only the final tile reports back, so the row resolves once.
                onFlipComplete={col === wordLength - 1 ? () => finishReveal(row) : undefined}
              />
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}
