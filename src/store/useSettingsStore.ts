'use client';

import { create } from 'zustand';

const KEY = 'fitdle:settings:v1';

/**
 * Themes recolour the *surfaces* only - never the three tile states.
 *
 * The whole palette rests on one rule: the result colours are the only
 * saturated things on screen. If a theme could change them, a screenshot from
 * one player would not mean the same thing as a screenshot from another, and
 * the shared emoji grid would stop matching the board. So themes move the
 * background hue and the accent, and the board reads identically in all of them.
 */
export const THEMES = ['midnight', 'graphite', 'abyss', 'plum', 'daylight'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABEL: Record<Theme, string> = {
  midnight: 'Midnight',
  graphite: 'Graphite',
  abyss: 'Abyss',
  plum: 'Plum',
  daylight: 'Daylight',
};

export interface Settings {
  /** Swap green/yellow and green/wine for blue/orange pairs. */
  colourblind: boolean;
  /** Suppress the tile flip and figure transitions. */
  reduceMotion: boolean;
  theme: Theme;
}

const DEFAULTS: Settings = { colourblind: false, reduceMotion: false, theme: 'midnight' };

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
      theme: THEMES.includes(parsed.theme as Theme) ? (parsed.theme as Theme) : 'midnight',
    };
  } catch {
    // Settings are cosmetic; a corrupt record should never block play.
    return DEFAULTS;
  }
}

/**
 * Applied as attributes on <html> rather than by threading props through every
 * component. The palette swap is then a handful of CSS variable overrides in
 * globals.css, which means every surface - tiles, keys, figure, legend, chips -
 * changes together and nothing can be missed.
 */
function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.toggleAttribute('data-colourblind', s.colourblind);
  el.toggleAttribute('data-reduce-motion', s.reduceMotion);
  el.setAttribute('data-theme', s.theme);
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
    const next = {
      colourblind: get().colourblind,
      reduceMotion: get().reduceMotion,
      theme: get().theme,
      [key]: value,
    };
    apply(next as Settings);
    setState({ [key]: value } as Partial<SettingsState>);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Storage disabled - the setting still applies for this session. */
    }
  },
}));
