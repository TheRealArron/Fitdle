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

/*
 * `next build` reads .env.local for the BUNDLE, but this script's own
 * `process.env` never saw it - so the manifest it writes was deriving host
 * permissions from variables that were set, looked unset, and produced an
 * extension that could reach nothing. Loaded here the same way the other
 * scripts do it, without adding a dependency.
 */
for (const line of (() => {
  try {
    return fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n');
  } catch {
    return [];
  }
})()) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
}

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
  const manifest = writeManifest(path.join(distDir, 'manifest.json'));
  writeIcons(path.join(distDir, 'icons'));

  console.log(`✓ extension-dist/ ready - ${htmlFiles.length} page(s), ${extracted} inline script(s) externalised`);
  const hosts = manifest.host_permissions ?? [];
  console.log(
    `  host permissions: ${hosts.length ? hosts.join(', ') : 'none'}` +
      `${manifest.permissions ? `  ·  permissions: ${manifest.permissions.join(', ')}` : ''}`,
  );
  console.log('  Load unpacked: chrome://extensions → Developer mode → Load unpacked → extension-dist/');
}

/**
 * Writes the manifest, with host permissions derived from where this build
 * actually talks to.
 *
 * ── Why these are generated rather than committed ───────────────────────────
 * The committed manifest used to ask for every https host on the internet -
 * the `https` wildcard pattern - plus a `"storage"` permission. Both were
 * wrong, and the broad one is the kind of wrong that gets an extension held in
 * review: Chrome renders that pattern to the user as "Read and change all your
 * data on all websites".
 *
 * What the popup actually needs is cross-origin `fetch` to two known origins -
 * the deployment it plays against, and the Supabase project it signs in to.
 * Both are build-time constants, so the build can say exactly what it needs
 * instead of asking for everything and hoping.
 *
 * `"storage"` was never used at all. The app persists through `localStorage`,
 * which needs no permission; nothing in `src/` calls a `chrome.*` API, and a
 * grep of the built output finds the word "chrome" only in the prose of the
 * landing page. So the key is omitted rather than shipped empty.
 *
 * Image hosts are deliberately absent: `<img>` loads are governed by the
 * extension page's CSP, not by host permissions, so the YouTube thumbnails need
 * nothing here. Video links open in a tab, which needs nothing either.
 */
function writeManifest(to) {
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));

  const origins = [];
  const add = (raw, what) => {
    const value = raw?.trim();
    if (!value) return false;
    try {
      origins.push(`${new URL(value).origin}/*`);
      return true;
    } catch {
      console.log(`  ! ${what} is not a URL (${value}) - omitting it from host_permissions`);
      return false;
    }
  };

  const hasApi = add(process.env.NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL');
  add(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');

  /*
   * A static export has no server of its own, so with no API url the popup
   * calls relative paths - which resolve to chrome-extension://<id>/api/... and
   * fail. The extension builds and installs perfectly and simply cannot play,
   * which is exactly the kind of failure worth being loud about at build time.
   */
  if (!hasApi) {
    console.log('  ! NEXT_PUBLIC_API_URL is not set - the popup has no server to play against.');
    console.log('    Set it to your deployment and rebuild, or the daily puzzle will not load.');
  }

  if (origins.length) manifest.host_permissions = [...new Set(origins)];

  fs.writeFileSync(to, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
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
