'use client';

import { create } from 'zustand';

const KEY = 'fitdle:settings:v1';

export interface Settings {
  /** Swap green/yellow and green/wine for blue/orange pairs. */
  colourblind: boolean;
  /** Suppress the tile flip and figure transitions. */
  reduceMotion: boolean;
}

const DEFAULTS: Settings = { colourblind: false, reduceMotion: false };

export interface SettingsState extends Settings {
  hydrated: boolean;
  load: () => void;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

function read(): Settings {
  try {
    if (typeof window === 'undefined') return DEFAULTS;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      colourblind: parsed.colourblind === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    // Settings are cosmetic; a corrupt record should never block play.
    return DEFAULTS;
  }
}

/**
 * Applied as attributes on <html> rather than by threading props through every
 * component. The palette swap is then a handful of CSS variable overrides in
 * globals.css, which means every surface — tiles, keys, figure, legend, chips —
 * changes together and nothing can be missed.
 */
function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.toggleAttribute('data-colourblind', s.colourblind);
  el.toggleAttribute('data-reduce-motion', s.reduceMotion);
}

export const useSettingsStore = create<SettingsState>()((setState, get) => ({
  ...DEFAULTS,
  hydrated: false,

  // Client-only: reads localStorage, so it must not run during SSR.
  load: () => {
    const s = read();
    apply(s);
    setState({ ...s, hydrated: true });
  },

  set: (key, value) => {
    const next = { colourblind: get().colourblind, reduceMotion: get().reduceMotion, [key]: value };
    apply(next as Settings);
    setState({ [key]: value } as Partial<SettingsState>);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Storage disabled — the setting still applies for this session. */
    }
  },
}));
