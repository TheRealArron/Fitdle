'use client';

const ROWS: Array<{ swatch: string; label: string }> = [
  { swatch: 'bg-state-correct', label: 'Both work it' },
  { swatch: 'bg-[#7f1d3a]', label: 'Only your guess' },
  { swatch: 'bg-tile-empty ring-1 ring-inset ring-tile-border', label: 'Not probed yet' },
];

/** Colour key for the body figure. Without it the figure is just decoration. */
export function MuscleLegend({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {ROWS.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className={`h-3 w-3 shrink-0 rounded-sm ${r.swatch}`} aria-hidden />
          <span className="text-[11px] leading-tight text-slate-400">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
