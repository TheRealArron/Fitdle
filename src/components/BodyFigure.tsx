'use client';

import { motion } from 'framer-motion';
import { memo } from 'react';
import { MUSCLE_LABEL, type MuscleRegion } from '@/data/muscles';

/**
 * Front and back anatomy chart, drawn from primitives rather than one traced
 * silhouette: a neutral "body base" layer (head, limbs, torso) with the muscle
 * regions painted on top. Hand-authoring an accurate humanoid outline is
 * fragile and hard to edit; stacked blobs read as an anatomy diagram, which is
 * exactly the register we want, and each region stays independently styleable.
 *
 * Coordinates are in a 100 x 215 space per view. The two views are laid out
 * side by side by the parent <svg> viewBox.
 */

type Shape =
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { t: 'path'; d: string };

/** Neutral scaffolding — never highlighted, just makes the blobs read as a body. */
const BASE: Shape[] = [
  { t: 'ellipse', cx: 50, cy: 18, rx: 12, ry: 14 }, // head
  { t: 'rect', x: 44, y: 29, w: 12, h: 10, r: 3 }, // neck
  { t: 'path', d: 'M31 42 L69 42 L64 101 L36 101 Z' }, // torso
  { t: 'rect', x: 36, y: 98, w: 28, h: 15, r: 6 }, // pelvis
  { t: 'rect', x: 15, y: 46, w: 13, h: 32, r: 6.5 }, // upper arm L
  { t: 'rect', x: 72, y: 46, w: 13, h: 32, r: 6.5 }, // upper arm R
  { t: 'rect', x: 13, y: 78, w: 12, h: 32, r: 6 }, // forearm L
  { t: 'rect', x: 75, y: 78, w: 12, h: 32, r: 6 }, // forearm R
  { t: 'ellipse', cx: 19, cy: 114, rx: 5, ry: 6 }, // hand L
  { t: 'ellipse', cx: 81, cy: 114, rx: 5, ry: 6 }, // hand R
  { t: 'rect', x: 35, y: 110, w: 14, h: 48, r: 7 }, // thigh L
  { t: 'rect', x: 51, y: 110, w: 14, h: 48, r: 7 }, // thigh R
  { t: 'rect', x: 36, y: 156, w: 12, h: 46, r: 6 }, // shin L
  { t: 'rect', x: 52, y: 156, w: 12, h: 46, r: 6 }, // shin R
  { t: 'ellipse', cx: 42, cy: 205, rx: 6, ry: 5 }, // foot L
  { t: 'ellipse', cx: 58, cy: 205, rx: 6, ry: 5 }, // foot R
];

const FRONT: Partial<Record<MuscleRegion, Shape[]>> = {
  shoulders: [
    { t: 'ellipse', cx: 28, cy: 46, rx: 10, ry: 8 },
    { t: 'ellipse', cx: 72, cy: 46, rx: 10, ry: 8 },
  ],
  chest: [
    { t: 'rect', x: 35, y: 44, w: 14, h: 18, r: 4 },
    { t: 'rect', x: 51, y: 44, w: 14, h: 18, r: 4 },
  ],
  abs: [{ t: 'rect', x: 42, y: 63, w: 16, h: 30, r: 4 }],
  obliques: [
    { t: 'rect', x: 35, y: 65, w: 6, h: 26, r: 3 },
    { t: 'rect', x: 59, y: 65, w: 6, h: 26, r: 3 },
  ],
  biceps: [
    { t: 'rect', x: 16, y: 52, w: 11, h: 22, r: 5.5 },
    { t: 'rect', x: 73, y: 52, w: 11, h: 22, r: 5.5 },
  ],
  forearms: [
    { t: 'rect', x: 14, y: 80, w: 10, h: 26, r: 5 },
    { t: 'rect', x: 76, y: 80, w: 10, h: 26, r: 5 },
  ],
  quads: [
    { t: 'rect', x: 36, y: 112, w: 12, h: 40, r: 6 },
    { t: 'rect', x: 52, y: 112, w: 12, h: 40, r: 6 },
  ],
  calves: [
    { t: 'rect', x: 37, y: 160, w: 10, h: 34, r: 5 },
    { t: 'rect', x: 53, y: 160, w: 10, h: 34, r: 5 },
  ],
};

const BACK: Partial<Record<MuscleRegion, Shape[]>> = {
  traps: [{ t: 'path', d: 'M38 40 L62 40 L66 52 L50 65 L34 52 Z' }],
  shoulders: [
    { t: 'ellipse', cx: 28, cy: 46, rx: 10, ry: 8 },
    { t: 'ellipse', cx: 72, cy: 46, rx: 10, ry: 8 },
  ],
  triceps: [
    { t: 'rect', x: 16, y: 52, w: 11, h: 22, r: 5.5 },
    { t: 'rect', x: 73, y: 52, w: 11, h: 22, r: 5.5 },
  ],
  forearms: [
    { t: 'rect', x: 14, y: 80, w: 10, h: 26, r: 5 },
    { t: 'rect', x: 76, y: 80, w: 10, h: 26, r: 5 },
  ],
  lats: [
    { t: 'path', d: 'M34 55 L47 62 L47 88 L36 81 Z' },
    { t: 'path', d: 'M66 55 L53 62 L53 88 L64 81 Z' },
  ],
  lowerBack: [{ t: 'rect', x: 42, y: 82, w: 16, h: 17, r: 4 }],
  glutes: [
    { t: 'ellipse', cx: 43, cy: 107, rx: 10, ry: 9 },
    { t: 'ellipse', cx: 57, cy: 107, rx: 10, ry: 9 },
  ],
  hamstrings: [
    { t: 'rect', x: 36, y: 114, w: 12, h: 38, r: 6 },
    { t: 'rect', x: 52, y: 114, w: 12, h: 38, r: 6 },
  ],
  calves: [
    { t: 'rect', x: 37, y: 160, w: 10, h: 34, r: 5 },
    { t: 'rect', x: 53, y: 160, w: 10, h: 34, r: 5 },
  ],
};

function renderShape(s: Shape, key: string, props: Record<string, unknown>) {
  if (s.t === 'ellipse') return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...props} />;
  if (s.t === 'rect') return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...props} />;
  return <path key={key} d={s.d} {...props} />;
}

export type RegionState = 'shared' | 'missed' | 'idle';

const FILL: Record<RegionState, string> = {
  // Your guess and the answer both work this muscle.
  shared: 'var(--color-state-correct)',
  // Your guess works it; the answer does not.
  missed: '#7f1d3a',
  idle: 'var(--color-tile-empty)',
};

const OPACITY: Record<RegionState, number> = { shared: 1, missed: 0.85, idle: 1 };

/**
 * Chrome caps extension popups at 600px tall, which is the tightest surface
 * this has to work on. Callers pass the responsive sizing; this is just the
 * drawing.
 */
interface BodyFigureProps {
  shared: ReadonlySet<MuscleRegion>;
  missed: ReadonlySet<MuscleRegion>;
  /** Regions of the answer's muscle group. Empty until the category unlocks. */
  category: ReadonlySet<MuscleRegion>;
  className?: string;
}

function BodyFigureImpl({ shared, missed, category, className }: BodyFigureProps) {
  const stateOf = (r: MuscleRegion): RegionState =>
    shared.has(r) ? 'shared' : missed.has(r) ? 'missed' : 'idle';

  const view = (
    map: Partial<Record<MuscleRegion, Shape[]>>,
    dx: number,
    label: string,
  ) => (
    <g transform={`translate(${dx} 0)`}>
      {/* Neutral body scaffolding. */}
      <g fill="var(--color-tile-border)" opacity={0.45}>
        {BASE.map((s, i) => renderShape(s, `b${i}`, {}))}
      </g>

      {/* Muscle regions. */}
      {(Object.keys(map) as MuscleRegion[]).map((region) => {
        const state = stateOf(region);
        return (
          <motion.g
            key={region}
            initial={false}
            animate={{ opacity: OPACITY[state] }}
            transition={{ duration: 0.35 }}
          >
            <title>{`${MUSCLE_LABEL[region]} — ${
              state === 'shared'
                ? 'also worked by the answer'
                : state === 'missed'
                  ? 'not worked by the answer'
                  : 'unknown'
            }`}</title>
            {map[region]!.map((s, i) =>
              renderShape(s, `${region}${i}`, {
                fill: FILL[state],
                stroke: category.has(region) ? 'var(--color-state-present)' : 'none',
                strokeWidth: category.has(region) ? 2 : 0,
                // Dashes distinguish the category hint from a scored region.
                strokeDasharray: category.has(region) ? '3 2' : undefined,
                style: { transition: 'fill 350ms ease' },
              }),
            )}
          </motion.g>
        );
      })}

      <text
        x={50}
        y={224}
        textAnchor="middle"
        className="fill-slate-500"
        style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}
      >
        {label}
      </text>
    </g>
  );

  return (
    <svg
      viewBox="0 0 210 232"
      className={className}
      role="img"
      aria-label="Muscle map showing which muscles your guesses share with the answer"
    >
      {view(FRONT, 0, 'Front')}
      {view(BACK, 110, 'Back')}
    </svg>
  );
}

export const BodyFigure = memo(BodyFigureImpl);
