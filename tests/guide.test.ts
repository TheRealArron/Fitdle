import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CATALOGUE } from '@/data/exercises';
import { GUIDE_SYSTEM_PROMPT } from '@/server/guide';
import { ANSWER_ORDER } from '@/server/answers';

/*
 * The guide is reachable MID-ROUND, unlike the form coach. That is only
 * defensible because it cannot narrow the answer - and the reason it cannot is
 * structural, not a request in the prompt. These tests are what keep it
 * structural.
 */

const guide = readFileSync(new URL('../src/server/guide.ts', import.meta.url), 'utf8');

/*
 * Comments stripped before scanning for forbidden references.
 *
 * The file explains WHY it must not touch the answer schedule, which means it
 * names it - and a naive grep then flags its own documentation. Exactly the
 * trap the bundle leak-check hit.
 */
const guideCode = guide.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const route = readFileSync(new URL('../src/app/api/guide/route.ts', import.meta.url), 'utf8');

/* ── the oracle boundary ──────────────────────────────────────────────────── */

test('the prompt contains no answer-pool name', () => {
  /*
   * The whole safety argument. A model that knows the catalogue can be asked
   * "which six-letter exercise works hamstrings?" and will perform the same
   * intersection that made the muscle panel hand over DEADLIFT outright.
   *
   * Telling a model not to answer that is a request, and requests get
   * jailbroken. Never giving it the data is not.
   */
  const found = ANSWER_ORDER.filter((name) =>
    new RegExp(`\\b${name}\\b`, 'i').test(GUIDE_SYSTEM_PROMPT),
  );
  assert.deepEqual(found, [], `the guide prompt names answers: ${found.join(', ')}`);
});

test('the prompt names no catalogue exercise at all', () => {
  // Not just answers - any exercise name narrows the field for someone playing.
  const found = CATALOGUE.map((e) => e.name).filter((name) =>
    new RegExp(`\\b${name}\\b`, 'i').test(GUIDE_SYSTEM_PROMPT),
  );
  assert.deepEqual(found, [], `the guide prompt names exercises: ${found.join(', ')}`);
});

test('the guide module never imports answer data', () => {
  // A future edit that "helpfully" injects the catalogue would defeat all of
  // the above, so the import itself is forbidden.
  assert.ok(!/@\/server\/answers/.test(guideCode), 'the guide imports the answer schedule');
  assert.ok(!/ANSWER_ORDER|COACHING/.test(guideCode), 'the guide references answer data');
  assert.ok(!/\bCATALOGUE\b/.test(guideCode), 'the guide imports the exercise catalogue');
});

test('it is told to refuse hints and to name no exercises', () => {
  // Belt as well as braces: the data is absent AND the instruction is explicit.
  assert.match(GUIDE_SYSTEM_PROMPT, /do not know today's answer/i);
  assert.match(GUIDE_SYSTEM_PROMPT, /do not name specific exercises/i);
  assert.match(GUIDE_SYSTEM_PROMPT, /work a particular muscle/i);
});

test('fitness and injury questions are handed off, not answered', () => {
  // The guide is not a coach. Pain in particular goes to a human.
  assert.match(GUIDE_SYSTEM_PROMPT, /physio/i);
  assert.match(GUIDE_SYSTEM_PROMPT, /form coach/i);
});

/* ── the rules it states are the rules the game runs ──────────────────────── */

test('the hint schedule is interpolated, not retyped', () => {
  /*
   * A prompt that hardcodes "guess 3" silently lies the moment the schedule
   * changes. Building it from the same constants the game uses means the two
   * cannot drift.
   */
  assert.match(guide, /\$\{CATEGORY_HINT_AT\}/);
  assert.match(guide, /\$\{EQUIPMENT_HINT_AT\}/);
  assert.match(guide, /\$\{MAX_GUESSES\}/);
});

/* ── the route ────────────────────────────────────────────────────────────── */

test('the guide is NOT gated on a finished round', () => {
  /*
   * Deliberately different from the coach. The coach knows the day's exercise
   * so it must wait; the guide knows nothing to leak, and gating it would make
   * it useless at the moment a new player most needs it.
   */
  assert.ok(!/openSession|reveal|403/.test(route), 'the guide is gated like the coach');
  assert.match(route, /rateLimit\(/, 'the guide is not rate limited');
});

test('the guide degrades instead of throwing', () => {
  assert.match(guide, /status: 'unconfigured'/);
  assert.match(guide, /RateLimitError/);
  assert.match(guide, /catch \(err\)/);
});

test('refusals are handled before content is read', () => {
  const refusalAt = guide.indexOf("stop_reason === 'refusal'");
  const contentAt = guide.indexOf('response.content');
  assert.ok(refusalAt > 0 && contentAt > refusalAt, 'content is read before the refusal check');
});

test('the guide module is server-only', () => {
  assert.ok(guide.startsWith("import 'server-only';"));
});
