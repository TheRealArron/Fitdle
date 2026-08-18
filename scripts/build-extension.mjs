#!/usr/bin/env node
/**
 * Packages the static export as an MV3 extension.
 *
 * The specification says "build with output: 'export' and wrap out/ with
 * manifest.json". That alone does not work. Manifest V3 enforces
 * `script-src 'self'` on extension pages and forbids relaxing it with
 * 'unsafe-inline'. Next's exported HTML carries inline bootstrap scripts
 * (`self.__next_f.push(...)` and friends), so Chrome silently blocks them and
 * the popup renders an empty shell.
 *
 * So after exporting we:
 *   1. Hoist every inline <script> into an external file and re-reference it.
 *   2. Rewrite absolute `/_next/...` URLs to relative, since a popup is loaded
 *      from chrome-extension://<id>/index.html and `/` is the extension root.
 *   3. Rename `_next` to `next-assets` - Chrome refuses to load resources from
 *      directories whose name starts with an underscore.
 *   4. Drop the manifest and generated icons in beside it.
 *
 * Output: extension-dist/ - load it unpacked via chrome://extensions.
 *
 * The API routes are moved aside for the duration of the build. `output:
 * 'export'` refuses to build at all if a route handler exists, and the
 * extension has no server to host one on - it calls the deployed instance
 * instead (NEXT_PUBLIC_API_URL). `pageExtensions` looked like a tidier filter
 * but breaks Next's own module resolution, so this is the honest version:
 * move, build, always move back.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
const distDir = path.join(root, 'extension-dist');
const extDir = path.join(root, 'extension');

const ASSET_DIR = 'next-assets';
const INLINE_DIR = 'inline';

const API_DIR = path.join(root, 'src', 'app', 'api');
const API_PARKED = path.join(root, '.api-parked');

function run() {
  console.log('› building static export…');

  /*
   * Next 16 generates `.next/dev/types/validator.ts` importing every route it
   * saw last time. With the API parked those modules are temporarily absent, so
   * typechecking fails on a stale artefact describing a tree that no longer
   * matches.
   *
   * Only the generated types are cleared, not the whole of `.next` - the build
   * cache is expensive to rebuild and is not what is wrong.
   */
  for (const dir of ['dev/types', 'types']) {
    fs.rmSync(path.join(root, '.next', dir), { recursive: true, force: true });
  }

  const hadApi = fs.existsSync(API_DIR);
  if (hadApi) fs.renameSync(API_DIR, API_PARKED);
  try {
    execFileSync('npx', ['next', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, BUILD_TARGET: 'extension' },
    });
  } finally {
    // finally, not after: a failed build must not leave the routes parked.
    if (hadApi) fs.renameSync(API_PARKED, API_DIR);
  }

  if (!fs.existsSync(outDir)) {
    throw new Error('next build did not produce out/ - is output:"export" active?');
  }

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(outDir, distDir, { recursive: true });

  // 3. Underscore-prefixed directories are unreachable in an extension.
  const from = path.join(distDir, '_next');
  if (fs.existsSync(from)) {
    fs.renameSync(from, path.join(distDir, ASSET_DIR));
  }

  fs.mkdirSync(path.join(distDir, INLINE_DIR), { recursive: true });

  const htmlFiles = walk(distDir).filter((f) => f.endsWith('.html'));
  let extracted = 0;

  for (const file of htmlFiles) {
    let html = fs.readFileSync(file, 'utf8');

    // 2. Absolute asset paths -> relative, and off the underscored directory.
    html = html
      .replaceAll('"/_next/', `"${ASSET_DIR}/`)
      .replaceAll("'/_next/", `'${ASSET_DIR}/`)
      .replaceAll('(/_next/', `(${ASSET_DIR}/`)
      .replaceAll('\\"/_next/', `\\"${ASSET_DIR}/`)
      .replaceAll('/_next/', `${ASSET_DIR}/`);

    // 1. Hoist inline scripts. Skip anything with a src, and skip non-JS
    //    types such as application/json which CSP does not execute anyway.
    html = html.replace(
      /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
      (whole, attrs, body) => {
        const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1];
        if (type && !/javascript|module/i.test(type)) return whole;
        if (!body.trim()) return whole;

        const name = `${createHash('sha256').update(body).digest('hex').slice(0, 16)}.js`;
        fs.writeFileSync(path.join(distDir, INLINE_DIR, name), body, 'utf8');
        extracted += 1;

        const kept = attrs.replace(/\s*(defer|async)\b/gi, '').trim();
        return `<script${kept ? ` ${kept}` : ''} src="${INLINE_DIR}/${name}"></script>`;
      },
    );

    fs.writeFileSync(file, html, 'utf8');
  }

  // 4. Manifest + icons.
  fs.copyFileSync(path.join(extDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
  writeIcons(path.join(distDir, 'icons'));

  console.log(`✓ extension-dist/ ready - ${htmlFiles.length} page(s), ${extracted} inline script(s) externalised`);
  console.log('  Load unpacked: chrome://extensions → Developer mode → Load unpacked → extension-dist/');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Copies the extension icons in.
 *
 * They are generated by `npm run logo` alongside every other size of the mark,
 * so the extension cannot end up showing a different logo from the site. This
 * used to be a hand-rolled PNG encoder drawing an approximate dumbbell, which
 * avoided a binary asset in git back when there was no logo to encode.
 */
function writeIcons(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const from = path.join(root, `assets/extension/icon${size}.png`);
    if (!fs.existsSync(from)) {
      throw new Error(`missing ${path.relative(root, from)} - run: npm run logo`);
    }
    fs.copyFileSync(from, path.join(dir, `icon${size}.png`));
  }
}

run();
