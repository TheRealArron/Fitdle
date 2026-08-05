'use client';

import { motion } from 'framer-motion';
import { memo } from 'react';
import type { LetterState } from '@/lib/evaluate';

export const FLIP_DURATION = 0.6;
/** Per-tile stagger. The spec's `delay: i * 0.1s`. */
export const FLIP_STAGGER = 0.1;

interface TileProps {
  letter: string;
  state: LetterState | null;
  /** Column index - drives the stagger. */
  index: number;
  /** Play the flip now (a freshly submitted row). */
  revealing: boolean;
  /** Already-resolved row restored from storage: show the colour, no animation. */
  settled: boolean;
  /** Winning row's celebratory bounce. */
  bouncing: boolean;
  onFlipComplete?: () => void;
}

const FACE_CLASS: Record<LetterState, string> = {
  // Scored faces carry a bloom in their own colour (see globals.css). Present
  // uses near-black text because yellow at full saturation cannot hold white
  // legibly - that pairing is the one place the palette needs a dark foreground.
  correct: 'bg-state-correct border-state-correct text-white tile-glow-correct',
  present: 'on-present bg-state-present border-state-present text-[#231a00] tile-glow-present',
  absent: 'bg-state-absent border-state-absent text-white/85 tile-glow-absent',
};

function TileImpl({
  letter,
  state,
  index,
  revealing,
  settled,
  bouncing,
  onFlipComplete,
}: TileProps) {
  const showBack = revealing || settled;
  const filled = letter !== '';

  return (
    <motion.div
      className="tile-perspective relative aspect-square w-full select-none"
      // Letter-entry pop. Only fires while the tile is still blank-faced.
      animate={
        bouncing
          ? { y: [0, -22, 0, -8, 0] }
          : { y: 0 }
      }
      transition={
        bouncing
          ? { duration: 0.55, delay: index * FLIP_STAGGER, ease: 'easeOut' }
          : { duration: 0.15 }
      }
    >
      <motion.div
        className="tile-3d relative h-full w-full"
        initial={false}
        animate={{ rotateX: showBack ? 180 : 0 }}
        transition={
          revealing
            ? {
                duration: FLIP_DURATION,
                delay: index * FLIP_STAGGER,
                ease: [0.4, 0, 0.2, 1],
              }
            : { duration: 0 }
        }
        onAnimationComplete={() => {
          if (revealing) onFlipComplete?.();
        }}
      >
        {/* Front - unrevealed face. */}
        <motion.div
          className={[
            'tile-face absolute inset-0 flex items-center justify-center',
            // Font scales off the tile's own width (see .tile-perspective in
            // globals.css) so a 9-wide grid stays legible without a media query.
            'rounded-lg border-2 font-game text-[52cqw] leading-none font-bold uppercase',
            'transition-colors duration-150',
            filled
              ? 'border-tile-filled bg-tile-empty text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'
              : 'border-tile-border bg-tile-empty/40 text-white',
          ].join(' ')}
          // Pop on letter entry.
          animate={filled && !showBack ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          {letter}
        </motion.div>

        {/* Back - scored face, pre-rotated so it reads upright at 180deg. */}
        <div
          className={[
            'tile-face tile-face-back absolute inset-0 flex items-center justify-center',
            // Font scales off the tile's own width (see .tile-perspective in
            // globals.css) so a 9-wide grid stays legible without a media query.
            'rounded-md border-2 font-game text-[52cqw] leading-none font-bold uppercase',
            state ? FACE_CLASS[state] : 'border-tile-border bg-tile-empty text-white',
          ].join(' ')}
        >
          {letter}
        </div>
      </motion.div>
    </motion.div>
  );
}

export const Tile = memo(TileImpl);
