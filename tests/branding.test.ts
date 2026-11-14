import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readCode } from './helpers/source.ts';

/**
 * The logo assets are generated, committed, and referenced by path - which
 * means every way they can break is silent.
 *
 * A CSS mask pointing at a missing file renders an empty box, not a broken
 * image: no console error, no failed-image icon, nothing in any log. The header
 * would simply lose its mark and the first report would be someone noticing.
 * Same for the icons - a missing opengraph-image.png costs you the link preview
 * on the exact post you were trying to share.
 *
 * So the check has to live here, where a build can fail on it.
 */

const root = path.resolve(import.meta.dirname, '..');

/** Every generated file, and roughly what a real one weighs. */
const ASSETS = [
  'public/mark.png',
  'public/logo.png',
  'src/app/icon.png',
  'src/app/apple-icon.png',
  'src/app/opengraph-image.png',
  // The extension build copies these rather than drawing its own, so a missing
  // one fails `npm run build:extension` instead of shipping a blank icon.
  'assets/extension/icon16.png',
  'assets/extension/icon48.png',
  'assets/extension/icon128.png',
  // Chrome will not offer to install the app without both of these.
  'public/icon-192.png',
  'public/icon-512.png',
  'public/icon-maskable-512.png',
];

test('every generated logo asset is present and non-trivial', () => {
  for (const rel of ASSETS) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `${rel} is missing - run: npm run logo`);
    /*
     * A placeholder or a truncated write would still "exist". The floor is low
     * because a 16px extension icon is legitimately only a few hundred bytes -
     * it only has to catch an empty or half-written file.
     */
    assert.ok(fs.statSync(file).size > 200, `${rel} looks empty or truncated`);
  }
});

test('the source the assets are derived from is committed too', () => {
  // Without it the assets cannot be regenerated at a different size, which is
  // the whole reason the pipeline is a script rather than four hand-made crops.
  assert.ok(
    fs.existsSync(path.join(root, 'assets/logo-source.png')),
    'assets/logo-source.png is missing - the assets can no longer be rebuilt',
  );
});

test('the in-app mark carries its shape in the alpha channel', () => {
  /*
   * The mark is tinted by CSS mask, so only alpha matters - and a PNG saved
   * without an alpha channel would mask to a solid rectangle. Byte 25 of a PNG
   * is the IHDR colour type; 6 is RGBA, 4 is grey+alpha.
   */
  const header = fs.readFileSync(path.join(root, 'public/mark.png')).subarray(0, 26);
  assert.equal(header.subarray(1, 4).toString(), 'PNG');
  assert.ok([4, 6].includes(header[25]), 'mark.png has no alpha channel, so it cannot be masked');
});

test('nothing references the starter favicon that build-logo.mjs deletes', () => {
  /*
   * Next serves src/app/favicon.ico ahead of anything generated from icon.png.
   * If it ever comes back, the tab silently shows the Next.js logo while every
   * other icon is correct - so the removal has to stay removed.
   */
  assert.ok(
    !fs.existsSync(path.join(root, 'src/app/favicon.ico')),
    'the starter favicon is back; it overrides icon.png',
  );
});

test('the mark is masked rather than drawn, so it tints per theme', () => {
  const src = readCode(new URL('../src/components/Wordmark.tsx', import.meta.url));
  assert.match(src, /maskImage/);
  assert.match(src, /currentColor/);
  /*
   * An <img> would render the source colour, which is near-black - correct on
   * the daylight theme and invisible on the other four.
   */
  assert.ok(!/<img/.test(src), 'the mark must be masked, not drawn as an image');
});
