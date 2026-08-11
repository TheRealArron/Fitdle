#!/usr/bin/env node
/**
 * Colour contrast, across every theme and the colourblind variant.
 *
 * Five themes times a colourblind toggle is ten palettes, and a colour that
 * reads perfectly in the one you develop in can be invisible in another. That
 * is not hypothetical here: measured, the lit muscles came out at 1.51:1 on the
 * light theme and the ruled-out ones at 1.74:1 on the dark ones - both far
 * under the 3:1 that non-text UI needs to convey a state at all, and neither
 * visible by looking at the theme you happen to have open.
 *
 * Ratios are WCAG 2.1 relative luminance.
 *   4.5:1  body text
 *   3:1    large text and non-text UI that carries meaning
 *
 *   npm run check:contrast
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');

const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
  head: (s) => `\x1b[1m${s}${RESET}`,
};

/* ── colour maths ─────────────────────────────────────────────────────────── */

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Flatten a translucent colour onto what sits behind it. */
function over(fg, bg, alpha) {
  const parse = (h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [f, b] = [parse(fg), parse(bg)];
  return `#${f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

/* ── read the palettes out of the stylesheet ──────────────────────────────── */

function varsIn(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

function blockFor(selector) {
  const i = css.indexOf(`${selector} {`);
  if (i === -1) return {};
  return varsIn(css.slice(i, css.indexOf('\n}', i)));
}

/** Tailwind defaults, for anything a theme does not override. */
const TAILWIND = {
  'color-rose-200': '#fecdd3',
  'color-rose-300': '#fda4af',
  'color-white': '#ffffff',
  'color-slate-300': '#cbd5e1',
  'color-slate-400': '#94a3b8',
  'color-slate-500': '#64748b',
};

const base = { ...TAILWIND, ...varsIn(css.slice(css.indexOf('@theme {'), css.indexOf('\n}', css.indexOf('@theme {')))) };
const themes = ['graphite', 'abyss', 'plum', 'daylight'];

/** Every palette a player can actually be looking at. */
const palettes = [];
for (const name of ['midnight', ...themes]) {
  const themed = name === 'midnight' ? base : { ...base, ...blockFor(`:root[data-theme='${name}']`) };
  palettes.push({ name, vars: themed });
  palettes.push({
    name: `${name} + colourblind`,
    vars: {
      ...themed,
      ...blockFor(':root[data-colourblind]'),
      ...blockFor(`:root[data-colourblind][data-theme='${name}']`),
    },
  });
}

/* ── what to check ────────────────────────────────────────────────────────── */

const CHECKS = [
  {
    what: 'lit muscle (shared) vs figure body',
    min: 3,
    fg: (v) => v['color-figure-shared'],
    bg: (v) => v['color-tile-empty'],
  },
  {
    what: 'lit muscle (ruled out) vs figure body',
    min: 3,
    fg: (v) => v['color-figure-missed'],
    bg: (v) => v['color-tile-empty'],
  },
  {
    what: 'chat error text on its tinted bubble',
    min: 4.5,
    fg: (v) => v['color-rose-200'],
    bg: (v) => over(v['color-state-excluded'], v['color-surface-2'], 0.2),
  },
  {
    what: 'opening-call "wrong" text on its chip',
    min: 4.5,
    fg: (v) => v['color-rose-300'],
    bg: (v) => over(v['color-state-excluded'], v['color-app-bg'], 0.25),
  },
  {
    what: 'muted body text on the page',
    min: 4.5,
    fg: (v) => v['color-slate-500'],
    bg: (v) => v['color-app-bg'],
  },
  {
    what: 'primary text on a raised surface',
    min: 4.5,
    fg: (v) => v['color-white'],
    bg: (v) => v['color-surface-2'],
  },
];

let failures = 0;
console.log(c.head('\nContrast across every theme and colourblind combination\n'));

for (const { what, min, fg, bg } of CHECKS) {
  console.log(`  ${what} ${c.dim(`(needs ${min}:1)`)}`);
  for (const { name, vars } of palettes) {
    const f = fg(vars);
    const b = bg(vars);
    if (!f || !b) {
      console.log(`    ${c.bad('?')} ${name.padEnd(24)} missing a colour`);
      failures++;
      continue;
    }
    const got = ratio(f, b);
    const ok = got >= min;
    if (!ok) failures++;
    console.log(
      `    ${ok ? c.ok('✓') : c.bad('✗')} ${name.padEnd(24)} ${got.toFixed(2)}:1 ${c.dim(`${f} on ${b}`)}`,
    );
  }
  console.log();
}

if (failures > 0) {
  console.log(c.bad(`${failures} combination(s) below the bar.`));
  console.log(c.dim('  A colour that reads in one theme can be invisible in another.'));
  process.exit(1);
}
console.log(c.ok('Every combination clears its bar.'));
