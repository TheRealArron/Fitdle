import assert from 'node:assert/strict';
import test from 'node:test';
import { searchVideoUrl, videoThumbnailUrl } from '@/data/exercises';
import { readFileSync } from 'node:fs';
import { ANSWER_ORDER, COACHING } from '@/server/answers';

const formVideoId = (name: string): string | null => COACHING[name]?.videoId ?? null;

/**
 * These are offline shape checks. Liveness was verified separately against
 * YouTube's oEmbed endpoint (40/40 returned a real title and channel); a unit
 * test must not depend on the network.
 */

test('every answer has a curated form video', () => {
  for (const name of ANSWER_ORDER) {
    assert.ok(formVideoId(name), `${name} has no pinned video`);
  }
});

test('video ids are well-formed YouTube ids', () => {
  for (const name of ANSWER_ORDER) {
    const id = formVideoId(name)!;
    assert.match(id, /^[A-Za-z0-9_-]{11}$/, `${name} -> "${id}" is not a valid video id`);
  }
});

test('no two exercises share a video', () => {
  // A duplicate almost always means a copy-paste slip in the table.
  const seen = new Map<string, string>();
  for (const name of ANSWER_ORDER) {
    const id = formVideoId(name)!;
    const prev = seen.get(id);
    assert.ok(!prev, `${name} reuses the video pinned to ${prev}`);
    seen.set(id, name);
  }
});

test('the client module carries no answer ordering or coaching payload', () => {
  /*
   * Scans CODE, not prose. The file's own header documents what must never be
   * added, and a naive substring search matched that comment — a false positive
   * that would have trained everyone to ignore this test.
   *
   * `npm run check:bundle` is the authoritative version: it greps the compiled
   * JavaScript that actually ships. This is the fast guard that runs on save.
   */
  const raw = readFileSync('src/data/exercises.ts', 'utf8');
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const forbidden of ['howTo', 'videoId', 'challenge', 'ANSWER_ORDER']) {
    assert.ok(!code.includes(forbidden), `${forbidden} leaked into the client module`);
  }
});

test('unknown exercises fall back to a search that cannot 404', () => {
  assert.equal(formVideoId('NOTREAL'), null);
  const url = searchVideoUrl('plank proper form');
  assert.ok(url.startsWith('https://www.youtube.com/results?search_query='));
  assert.ok(!url.includes(' '), 'query must be encoded');
});

test('every answer keeps a usable search query as the fallback', () => {
  for (const name of ANSWER_ORDER) {
    assert.ok(COACHING[name].videoQuery.length > 3, `${name} has no usable search fallback`);
  }
});

test('thumbnail urls are https and id-scoped', () => {
  const url = videoThumbnailUrl('otzWCWpuW-A');
  assert.equal(url, 'https://i.ytimg.com/vi/otzWCWpuW-A/mqdefault.jpg');
});

test('the coaching map is keyed by the exact uppercase name', () => {
  // Unlike the old client helper this is not case-insensitive: every caller is
  // server-side and already holds the canonical name from ANSWER_ORDER.
  assert.ok(formVideoId('SQUAT'));
  assert.equal(formVideoId('squat'), null);
});
