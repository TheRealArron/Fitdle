#!/usr/bin/env node
/**
 * Proves the answer schedule is not in the JavaScript that ships.
 *
 * The unit test scans source, which is fast but not the real question - the
 * real question is what a player can read in devtools. This greps the compiled
 * client chunks for the two things that must never appear:
 *
 *   1. The date -> answer ORDERING. The word list itself is public on purpose
 *      (the exercise index hands it over), so finding "SQUAT" proves nothing.
 *      What matters is whether the ordered sequence survives, which is detected
 *      by looking for consecutive runs of the real schedule.
 *   2. The coaching payload, whose presence would imply the answers came with it.
 *
 * Run after `npm run build`. Exits non-zero on a leak, so CI can gate on it.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
};

/** Client chunks only. Server bundles are allowed to contain everything. */
function clientChunks() {
  const roots = [
    path.join(root, '.next', 'static'),
    path.join(root, 'extension-dist'),
  ].filter(existsSync);

  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.js')) out.push(full);
    }
  };
  roots.forEach(walk);
  return out;
}

const files = clientChunks();
if (files.length === 0) {
  console.log(c.bad('✗ no client chunks found - run `npm run build` first'));
  process.exit(1);
}

const { ANSWER_ORDER, COACHING } = await import('../src/server/answers.ts');

/*
 * A run of consecutive answers is the signature of the schedule. Any single
 * name is expected (the catalogue is public); five in the right order is not.
 */
const RUN = 5;
const runs = [];
for (let i = 0; i + RUN <= ANSWER_ORDER.length; i++) {
  runs.push(ANSWER_ORDER.slice(i, i + RUN));
}

const coachingSamples = ANSWER_ORDER.slice(0, 8).map((n) => COACHING[n].howTo[0]);
const videoSamples = ANSWER_ORDER.slice(0, 8).map((n) => COACHING[n].videoId);

let leaked = false;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  for (const run of runs) {
    // Names may be separated by quotes/commas in the minified output.
    if (run.every((n) => text.includes(n))) {
      const window = 400;
      const first = text.indexOf(run[0]);
      const slice = text.slice(Math.max(0, first - window), first + window);
      if (run.every((n) => slice.includes(n))) {
        console.log(c.bad(`✗ answer ORDER leaked in ${rel}`));
        console.log(c.dim(`  found consecutive run: ${run.join(' -> ')}`));
        leaked = true;
        break;
      }
    }
  }

  for (const sample of coachingSamples) {
    if (sample && text.includes(sample)) {
      console.log(c.bad(`✗ coaching text leaked in ${rel}`));
      console.log(c.dim(`  "${sample.slice(0, 60)}…"`));
      leaked = true;
      break;
    }
  }

  for (const id of videoSamples) {
    if (id && text.includes(id)) {
      console.log(c.bad(`✗ curated video id leaked in ${rel}`));
      console.log(c.dim(`  ${id}`));
      leaked = true;
      break;
    }
  }
}

console.log();
if (leaked) {
  console.log(c.bad('Answer data is reachable from the browser.'));
  process.exit(1);
}
console.log(
  c.ok('✓ no answer ordering, coaching text or video ids in any client chunk'),
  c.dim(`(${files.length} files scanned)`),
);
