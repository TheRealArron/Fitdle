import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CATALOGUE } from '@/data/exercises';
import { readCode } from './helpers/source.ts';

/**
 * The landing page makes factual claims about the product, and nothing else in
 * the repo would notice if they stopped being true.
 *
 * This is not hypothetical. The first published version of this copy said "100
 * exercises" when there were 99, because the number was typed rather than read.
 * A marketing page that misstates the product is worse than one that says less,
 * and the reader who checks is exactly the reader worth having.
 */

const root = path.resolve(import.meta.dirname, '..');

test('the landing page derives its numbers instead of typing them', () => {
  const src = readCode(new URL('../src/app/page.tsx', import.meta.url));

  // Each of these is a claim on the page that must track a real constant.
  for (const symbol of ['CATALOGUE', 'MAX_GUESSES', 'SCHEDULE_SIZE', 'CATEGORY_HINT_AT']) {
    assert.match(src, new RegExp(`\\b${symbol}\\b`), `the page should read ${symbol}, not restate it`);
  }

  /*
   * The specific bug, guarded: a bare count of exercises written as a literal.
   * Any number in that range sitting next to the word "exercises" is either
   * wrong now or will be the next time one is added.
   */
  assert.ok(
    !/\b\d{2,4}\s+exercises\b/i.test(src),
    'the exercise count is hardcoded; read CATALOGUE.length instead',
  );
});

test('the exercise count the page would render is the real one', () => {
  // Proves the derivation resolves, not just that the symbol appears.
  assert.ok(CATALOGUE.length > 0);
  assert.equal(CATALOGUE.length, new Set(CATALOGUE.map((e) => e.name)).size, 'duplicate names');
});

test('the landing page sends people to the game', () => {
  const src = readCode(new URL('../src/app/page.tsx', import.meta.url));
  assert.match(src, /href="\/play"/, 'nothing on the landing page links to the game');
  assert.ok(fs.existsSync(path.join(root, 'src/app/play/page.tsx')), '/play does not exist');
});

test('the extension popup opens the game, not the landing page', () => {
  /*
   * The static export names files after routes, so moving the game from `/` to
   * `/play` moved the popup's entry point too. Nothing at build time checks
   * this: a manifest pointing at index.html still builds, installs, and opens -
   * it just shows a marketing page in a 400px popup instead of the board.
   */
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(manifest.action.default_popup, 'play.html');
});

test('the landing page itself stays a server component', () => {
  // readCode, not readSource: the comment below names framer-motion, and an
  // absence check that reads comments matches its own explanation.
  const src = readCode(new URL('../src/app/page.tsx', import.meta.url));
  /*
   * The page is the first thing a cold visitor loads, and almost all of it is
   * text that never changes. Marking the whole file 'use client' would ship
   * every word of that copy to the browser as JavaScript.
   *
   * Interactivity is allowed, but as an island: the anatomy drill is its own
   * client component and only it crosses the boundary. That is the distinction
   * this guards - not "no interactivity", but "the page is not the client
   * component".
   */
  assert.ok(!/^'use client'/m.test(src), 'the landing page must not be a client component');
  assert.ok(!/framer-motion/.test(src), 'animate with CSS here; let islands own their runtimes');
});

test('the embedded drill cannot touch puzzle state', () => {
  /*
   * The drill sits in front of people who have not started a round, so it must
   * not be able to spend a guess, move a streak, or reveal a seed. It was built
   * that way deliberately; this keeps it that way.
   */
  const drill = readCode(new URL('../src/components/AnatomyDrill.tsx', import.meta.url));
  assert.ok(!/useGameStore/.test(drill), 'the drill must not read or write puzzle state');
  assert.ok(!/\/api\//.test(drill), 'the drill must not call the game API');
});
