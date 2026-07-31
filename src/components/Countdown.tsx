'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { msUntilNextPuzzle } from '@/lib/daily';

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function Countdown() {
  // Rendered blank on the first paint so SSR and hydration agree.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextPuzzle());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-center gap-2 text-center">
      <Clock className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="text-xs uppercase tracking-widest text-slate-500">Next exercise</span>
      <span className="font-game text-sm font-bold tabular-nums text-slate-300">
        {remaining === null ? '--:--:--' : format(remaining)}
      </span>
    </div>
  );
}
