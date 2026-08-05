import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CATALOGUE } from '@/data/exercises';
import { ANSWER_ORDER, COACHING } from '@/server/answers';
import { answerFor, playGuesses } from '@/server/game';

const byName = new Map(CATALOGUE.map((e) => [e.name, e]));

/* ── the home versions ────────────────────────────────────────────────────── */

test('every answer needing equipment has a no-equipment substitute', () => {
  /*
   * The game ends by telling you to go and do the exercise. For the 25 answers
   * that need a barbell, dumbbell, kettlebell or machine, that instruction is
   * useless to anyone not standing in a gym - which is most players, most days.
   */
  const missing: string[] = [];
  for (const name of ANSWER_ORDER) {
    const e = byName.get(name);
    if (!e || e.equipment === 'Bodyweight') continue;
    if (!COACHING[name]?.homeVersion) missing.push(`${name} (${e.equipment})`);
  }
  assert.deepEqual(missing, [], `no home version for: ${missing.join(', ')}`);
});

test('bodyweight answers carry no substitute', () => {
  // They are already the home version; a substitute would be noise.
  for (const name of ANSWER_ORDER) {
    const e = byName.get(name);
    if (e?.equipment !== 'Bodyweight') continue;
    assert.equal(COACHING[name]?.homeVersion, undefined, `${name} has a redundant home version`);
  }
});

test('home versions are usable instructions, not labels', () => {
  for (const [name, c] of Object.entries(COACHING)) {
    if (!c.homeVersion) continue;
    assert.ok(c.homeVersion.name.length > 3, `${name}: substitute has no name`);
    assert.ok(
      c.homeVersion.howTo.length > 60,
      `${name}: "${c.homeVersion.howTo}" is too short to actually follow`,
    );
    assert.ok(
      /\.$/.test(c.homeVersion.howTo.trim()),
      `${name}: substitute instructions read as a fragment`,
    );
  }
});

/* ── the gate ─────────────────────────────────────────────────────────────── */

test('the home version rides the reveal, so it is unreachable mid-round', () => {
  const seed = 20260806;
  const answer = answerFor(seed);

  const midRound = playGuesses(seed, [], answer);
  assert.equal(midRound.reveal, null, 'nothing to leak from');

  const finished = playGuesses(seed, [answer.name], answer);
  assert.ok(finished.reveal);
  const expected = COACHING[answer.name]?.homeVersion ?? null;
  assert.deepEqual(finished.reveal.homeVersion, expected);
});

/* ── the prompt's guardrails ──────────────────────────────────────────────── */

const coachSource = readFileSync(new URL('../src/server/coach.ts', import.meta.url), 'utf8');

test('the coach never ships a hardcoded key', () => {
  assert.ok(
    coachSource.includes('process.env.ANTHROPIC_API_KEY'),
    'the key must come from the environment',
  );
  assert.ok(
    !/sk-ant-[A-Za-z0-9-]{10,}/.test(coachSource),
    'a literal API key is present in the source',
  );
});

test('the key is server-only', () => {
  // NEXT_PUBLIC_ would inline it into every browser bundle.
  assert.ok(!coachSource.includes('NEXT_PUBLIC_ANTHROPIC'), 'the key would ship to the browser');
  assert.ok(coachSource.startsWith("import 'server-only';"), 'missing the server-only guard');
});

test('the prompt refuses to coach through pain', () => {
  /*
   * The one guardrail that is not about product scope. A browser cannot assess
   * an injury, and a word game offering a modification to train through joint
   * pain is doing real harm to a real person.
   */
  const prompt = coachSource.slice(coachSource.indexOf('SAFETY'));
  assert.match(prompt, /not a clinician/i);
  assert.match(prompt, /physio|doctor/i);
  assert.match(prompt, /do not suggest a workaround/i);
  assert.match(prompt, /never diagnose/i);
});

test('the prompt is scoped to one exercise and refuses programming', () => {
  assert.match(coachSource, /THIS exercise only/);
  assert.match(coachSource, /training programme/i);
});

test('refusals are handled before content is read', () => {
  // response.content can be empty on a refusal; indexing it would throw inside
  // a route handler and take the result screen down with it.
  const refusalAt = coachSource.indexOf("stop_reason === 'refusal'");
  const contentAt = coachSource.indexOf('response.content');
  assert.ok(refusalAt > 0 && contentAt > refusalAt, 'content is read before the refusal check');
});

test('askCoach degrades instead of throwing', () => {
  // A coaching feature failing must not break the result screen it lives on.
  assert.match(coachSource, /catch \(err\)/);
  assert.match(coachSource, /status: 'unconfigured'/);
  assert.match(coachSource, /RateLimitError/);
});

test('the coach route is gated on a finished round', async () => {
  const route = readFileSync(new URL('../src/app/api/coach/route.ts', import.meta.url), 'utf8');
  assert.match(route, /openSession/, 'must verify the signed session');
  assert.match(route, /outcome\.reveal/, 'must gate on the round being over');
  assert.equal(
    (route.match(/status: 403/g) ?? []).length,
    2,
    'both the missing-session and unfinished-round paths must refuse',
  );
});
