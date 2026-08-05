'use client';

import { Eye, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  THEMES,
  THEME_LABEL,
  useSettingsStore,
  type Theme,
} from '@/store/useSettingsStore';
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

/** Two-swatch preview: page surface plus that theme's accent. */
const THEME_SWATCH: Record<Theme, [string, string]> = {
  midnight: ['#0a0e18', '#34d399'],
  graphite: ['#0e1013', '#a3e635'],
  abyss: ['#04121a', '#22d3ee'],
  plum: ['#120a1b', '#c084fc'],
};

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colourblind = useSettingsStore((s) => s.colourblind);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const theme = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.set);

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-3">
        <section className="flex flex-col gap-2">
          <h3 className="label px-1">Theme</h3>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => {
              const [bg, accent] = THEME_SWATCH[t];
              const active = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSetting('theme', t)}
                  className={[
                    'flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors',
                    active
                      ? 'bg-white/[0.09] ring-1 ring-inset ring-white/20'
                      : 'panel-raised hover:bg-white/[0.06]',
                  ].join(' ')}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10"
                    style={{ backgroundColor: bg }}
                    aria-hidden
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                  </span>
                  <span className="text-sm font-medium text-white">{THEME_LABEL[t]}</span>
                </button>
              );
            })}
          </div>
          <p className="px-1 text-[11px] leading-snug text-slate-500">
            Themes change the surfaces only. Green, yellow and grey always mean the same thing,
            so a screenshot reads identically whichever theme took it.
          </p>
        </section>

        <div className="my-1 border-t border-white/[0.07]" />
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
          Saved in this browser. Reduce motion also follows your system setting automatically -
          this forces it on regardless.
        </p>
      </div>
    </Modal>
  );
}
