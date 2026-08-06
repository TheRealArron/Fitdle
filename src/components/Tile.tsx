'use client';

import { motion } from 'framer-motion';
import { memo } from 'react';
import type { LetterState } from '@/lib/evaluate';

/*
 * Flip timing.
 *
 * 0.6s per tile with a 0.1s stagger meant a nine-wide row took 1.4s to resolve,
 * which reads as sluggish rather than deliberate - you are waiting on the game
 * instead of watching it. Slightly quicker per tile and a tighter stagger keeps
 * the cascade legible while getting the whole row done in about a second.
 */
export const FLIP_DURATION = 0.5;
export const FLIP_STAGGER = 0.075;

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
        /*
         * The flip is three things moving together, not one rotation:
         *
         *   rotateX  the turn itself
         *   scale    a slight swell at the halfway point, so the tile reads as
         *            coming toward you rather than shrinking into the page
         *   z        actual forward travel, which only means anything because
         *            the parent supplies a perspective
         *
         * Rotation alone is what makes a CSS flip look like a squash. The other
         * two are the whole difference.
         */
        animate={
          revealing
            ? { rotateX: 180, scale: [1, 1.06, 1], z: [0, 26, 0] }
            : { rotateX: showBack ? 180 : 0, scale: 1, z: 0 }
        }
        transition={
          revealing
            ? {
                duration: FLIP_DURATION,
                delay: index * FLIP_STAGGER,
                // Symmetric ease-in-out. The old curve decelerated from the
                // first frame, so the tile never appeared to gather speed -
                // a real card accelerates into the turn and settles out of it.
                ease: [0.45, 0.05, 0.25, 1],
                scale: { times: [0, 0.5, 1] },
                z: { times: [0, 0.5, 1] },
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
            // Radius MUST match the back face. They were `lg` and `md`, so the
            // corners visibly jumped at the halfway swap - the geometry has to
            // be identical for the two faces to read as one object.
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
            'rounded-lg border-2 font-game text-[52cqw] leading-none font-bold uppercase',
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
