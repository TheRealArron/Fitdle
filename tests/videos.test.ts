import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANSWERS,
  formVideoId,
  formVideoUrl,
  searchVideoUrl,
  videoThumbnailUrl,
} from '@/data/exercises';

/**
 * These are offline shape checks. Liveness was verified separately against
 * YouTube's oEmbed endpoint (40/40 returned a real title and channel); a unit
 * test must not depend on the network.
 */

test('every answer has a curated form video', () => {
  for (const a of ANSWERS) {
    assert.ok(formVideoId(a.name), `${a.name} has no pinned video`);
  }
});

test('video ids are well-formed YouTube ids', () => {
  for (const a of ANSWERS) {
    const id = formVideoId(a.name)!;
    assert.match(id, /^[A-Za-z0-9_-]{11}$/, `${a.name} -> "${id}" is not a valid video id`);
  }
});

test('no two exercises share a video', () => {
  // A duplicate almost always means a copy-paste slip in the table.
  const seen = new Map<string, string>();
  for (const a of ANSWERS) {
    const id = formVideoId(a.name)!;
    const prev = seen.get(id);
    assert.ok(!prev, `${a.name} reuses the video pinned to ${prev}`);
    seen.set(id, a.name);
  }
});

test('formVideoUrl points at the curated watch page', () => {
  const squat = ANSWERS.find((a) => a.name === 'SQUAT')!;
  assert.equal(formVideoUrl(squat), `https://www.youtube.com/watch?v=${formVideoId('SQUAT')}`);
});

test('unknown exercises fall back to a search that cannot 404', () => {
  assert.equal(formVideoId('NOTREAL'), null);
  const url = searchVideoUrl('plank proper form');
  assert.ok(url.startsWith('https://www.youtube.com/results?search_query='));
  assert.ok(!url.includes(' '), 'query must be encoded');
});

test('every answer keeps a usable search query as the fallback', () => {
  for (const a of ANSWERS) {
    assert.ok(a.videoQuery.length > 3, `${a.name} has no usable search fallback`);
  }
});

test('thumbnail urls are https and id-scoped', () => {
  const url = videoThumbnailUrl('otzWCWpuW-A');
  assert.equal(url, 'https://i.ytimg.com/vi/otzWCWpuW-A/mqdefault.jpg');
});

test('lookup is case-insensitive', () => {
  assert.equal(formVideoId('squat'), formVideoId('SQUAT'));
});
