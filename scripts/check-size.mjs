#!/usr/bin/env node
/**
 * First-load JavaScript budget.
 *
 * A budget you have to remember to look at is not a budget. `next-bundle-analyzer`
 * is a treemap you open when you already suspect a problem; this fails the build
 * when the number moves, which is the only version that catches a regression the
 * week it lands.
 *
 * Measures gzipped bytes, because that is what the user actually downloads.
 *
 *   npm run check:size
 */


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  warn: (s) => `\x1b[33m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
};

/*
 * Gzipped kB of first-load JS.
 *
 * A RATCHET, not a pass mark. It sits just above where the bundle actually is
 * so any increase fails immediately - the failure mode worth catching, because
 * bundles grow a few kB at a time and nobody notices until the popup feels slow.
 *
 * History, so the number is not mistaken for a guess:
 *
 *   240 kB  @supabase/supabase-js was in the initial chunk - ~59 kB gzipped of
 *           auth SDK that a signed-out player never calls.
 *   185 kB  It is now imported on demand, gated on a one-key localStorage probe
 *           that answers "is anyone signed in here?" without loading anything.
 *
 * What is left is mostly irreducible for this app: React, framer-motion (the
 * tile flip and the figure), lucide icons, and the game itself.
 */
const BUDGET_KB = 185;

const manifest = path.join(root, '.next', 'app-build-manifest.json');
if (!fs.existsSync(manifest)) {
  console.log(c.bad('✗ no build found - run `npm run build` first'));
  process.exit(1);
}

const { pages } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const files = [...new Set(pages['/page'] ?? [])].filter((f) => f.endsWith('.js'));

let total = 0;
const rows = [];
for (const rel of files) {
  const abs = path.join(root, '.next', rel);
  if (!fs.existsSync(abs)) continue;
  const gz = zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length;
  total += gz;
  rows.push({ name: path.basename(rel), gz });
}

rows.sort((a, b) => b.gz - a.gz);
const kb = (n) => (n / 1024).toFixed(1);

console.log(`First-load JS for ${c.dim('/')} ${c.dim('(gzipped)')}\n`);
for (const r of rows.slice(0, 6)) {
  console.log(`  ${kb(r.gz).padStart(7)} kB  ${c.dim(r.name)}`);
}
if (rows.length > 6) console.log(c.dim(`  ${' '.repeat(6)}…and ${rows.length - 6} more`));

const totalKb = total / 1024;
const pct = Math.round((totalKb / BUDGET_KB) * 100);
console.log(`\n  ${c.dim('─'.repeat(40))}`);
console.log(`  ${kb(total).padStart(7)} kB  total  ${c.dim(`(${pct}% of the ${BUDGET_KB} kB budget)`)}`);

if (totalKb > BUDGET_KB) {
  console.log(`\n${c.bad(`✗ over budget by ${(totalKb - BUDGET_KB).toFixed(1)} kB.`)}`);
  console.log(c.dim('  The extension ships this on every popup open.'));
  console.log(c.dim('  If the growth is deliberate, raise BUDGET_KB and say why in the commit.'));
  process.exit(1);
}
if (pct >= 90) {
  console.log(
    `\n${c.warn('? at the ratchet.')} ${c.dim('Anything new needs a saving to pay for it.')}`,
  );
} else {
  console.log(`\n${c.ok('✓ within budget.')}`);
}
