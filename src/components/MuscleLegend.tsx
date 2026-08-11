'use client';

import { CATEGORY_HINT_AT } from '@/data/exercises';

/**
 * Colour key for the body figure.
 *
 * Every visual state the figure can show is listed here, including the dashed
 * amber outline - that one is easy to miss because it appears mid-game rather
 * than at the start, and an unexplained marker on an anatomy diagram reads as
 * decoration instead of information.
 */

interface Row {
  swatch: string;
  title: string;
  detail: string;
}

const ROWS: Row[] = [
  {
    swatch: 'bg-figure-shared',
    title: 'Shared',
    detail: 'Your guess and the answer both work this muscle.',
  },
  {
    swatch: 'bg-figure-missed',
    title: 'Ruled out',
    detail: 'Your guess works it, the answer does not.',
  },
  {
    swatch: 'bg-tile-empty ring-1 ring-inset ring-tile-border',
    title: 'Unknown',
    detail: 'No guess has touched it yet, so it tells you nothing.',
  },
];

export function MuscleLegend({
  className = '',
  detailed = false,
}: {
  className?: string;
  /** Show the one-line explanation under each state, not just the label. */
  detailed?: boolean;
}) {
  return (
    <ul className={`flex flex-col ${detailed ? 'gap-3' : 'gap-1.5'} ${className}`}>
      {ROWS.map((r) => (
        <li key={r.title} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${r.swatch}`}
            aria-hidden
          />
          <div className="min-w-0">
            <span className="text-[11px] font-semibold leading-tight text-slate-300">
              {r.title}
            </span>
            {detailed && (
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{r.detail}</p>
            )}
          </div>
        </li>
      ))}

      {/* The dashed outline is a different channel from the fills - it marks the
          answer's muscle group, which is a hint, not a scored result. */}
      <li className="flex items-start gap-2.5">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-dashed border-state-present"
          aria-hidden
        />
        <div className="min-w-0">
          <span className="text-[11px] font-semibold leading-tight text-slate-300">
            Target area
          </span>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {detailed
              ? `From guess ${CATEGORY_HINT_AT}, a dashed amber ring marks the answer's muscle group. It only appears on muscles you have not probed yet, so it always tells you something new. An outlined muscle is not necessarily worked.`
              : `Unprobed muscles in the target group, from guess ${CATEGORY_HINT_AT}`}
          </p>
        </div>
      </li>
    </ul>
  );
}
