'use client';

import { Eye, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Modal } from './Modal';

function Toggle({
  icon: Icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="panel-raised flex w-full items-start gap-3 rounded-xl p-3.5 text-left transition-colors hover:bg-white/[0.06]"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{detail}</span>
      </span>
      <span
        className={[
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-state-correct' : 'bg-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colourblind = useSettingsStore((s) => s.colourblind);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setSetting = useSettingsStore((s) => s.set);

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-3">
        <Toggle
          icon={Eye}
          title="Colourblind-safe colours"
          detail="Swaps green/yellow for blue/orange across the tiles, keyboard, muscle figure and share grid. Red-green deficiency breaks both of this game's colour channels at once, so all of them change together."
          checked={colourblind}
          onChange={(v) => setSetting('colourblind', v)}
        />
        <Toggle
          icon={Zap}
          title="Reduce motion"
          detail="Cuts the tile flip and figure transitions to near-instant while keeping every colour change, so no information is lost."
          checked={reduceMotion}
          onChange={(v) => setSetting('reduceMotion', v)}
        />
        <p className="px-1 text-[11px] leading-relaxed text-slate-500">
          Saved in this browser. Reduce motion also follows your system setting automatically —
          this forces it on regardless.
        </p>
      </div>
    </Modal>
  );
}
