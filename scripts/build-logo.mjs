#!/usr/bin/env node
/**
 * Derives every logo asset the app needs from one source file.
 *
 *   assets/logo-source.png   ->   npm run logo
 *
 * WHY A SCRIPT RATHER THAN CHECKED-IN CROPS
 * A favicon, an app icon, an OG card and an in-header mark are four different
 * croppings of the same drawing. Cut by hand they drift: someone re-exports the
 * logo, updates two of the four, and the tab icon quietly stays a version
 * behind. Here the source is the only thing anyone edits and the rest is output.
 *
 * ── The colour problem this solves ──────────────────────────────────────────
 * The mark is a near-black silhouette. The app has five themes, four of them
 * dark - so a black logo is invisible in most of the app, and a white one is
 * invisible in the fifth. Recolouring by hand means five files.
 *
 * So the in-app mark is emitted as ALPHA ONLY: a white silhouette whose shape
 * lives entirely in the alpha channel. The page uses it as a CSS mask and fills
 * it with a theme colour, which means one file tints itself correctly in every
 * theme, including colourblind mode, and stays correct when a theme changes.
 *
 * Standalone assets (favicon, OG card) cannot mask against anything, so those
 * are baked with explicit colours.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'assets/logo-source.png');

const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
  head: (s) => `\x1b[1m${s}${RESET}`,
};

/** Brand colours, kept in step with globals.css. */
const ACCENT = { r: 0x34, g: 0xd3, b: 0x99 };
const PLATE = { r: 0x0a, g: 0x0e, b: 0x18 };
const PAPER = { r: 0xe8, g: 0xef, b: 0xf7 };

if (!fs.existsSync(SOURCE)) {
  console.log(c.bad('\nNo logo source found.\n'));
  console.log(`  Save the logo as ${c.head('assets/logo-source.png')} and run this again.`);
  console.log(c.dim('  A transparent background is ideal; a flat white one works too.'));
  console.log(c.dim('  Bigger is better - everything below is downscaled from it.\n'));
  process.exit(1);
}

/* ── read the drawing ─────────────────────────────────────────────────────── */

const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H } = info;

/*
 * Ink coverage per pixel, 0-255.
 *
 * The source might be a transparent PNG or a flat-background export, and which
 * one it is decides where the shape actually lives. Rather than require one,
 * sample the corners: a transparent corner means the alpha channel already
 * holds the shape, an opaque one means the shape is whatever differs from that
 * background colour. Coverage rather than a boolean, so edges stay antialiased.
 */
const corners = [
  [0, 0],
  [W - 1, 0],
  [0, H - 1],
  [W - 1, H - 1],
].map(([x, y]) => {
  const i = (y * W + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
});

const transparentBg = corners.every((p) => p.a < 32);
const bg = corners[0];

/*
 * Where "part of the drawing" starts and stops, as a sum of per-channel
 * distance from the background (max 765).
 *
 * These exist because the source can be a screenshot rather than a clean
 * export - the current one is, complete with the design tool's background
 * grid. Those faint lines are still a colour difference, so without a floor
 * they count as ink: every row of the image then contains some, the empty band
 * between figure and wordmark disappears, and the tab icon ends up being the
 * whole canvas scaled to 16px.
 */
const FLOOR = 90;
const SOLID = 400;

const ink = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  const a = data[i + 3];
  if (transparentBg) {
    ink[p] = a;
    continue;
  }
  /*
   * Distance from the background colour, through a soft threshold.
   *
   * A single cutoff would either keep the grid or eat the logo's antialiased
   * edges. Two points do both jobs: everything under FLOOR is discarded
   * outright, everything over SOLID is fully opaque, and the ramp between them
   * preserves edge pixels. The gap between grid and ink is enormous - measured
   * on the current source, grid lines sit at a distance of ~48 and the
   * silhouette at ~676 - so the thresholds are nowhere near either.
   */
  const d =
    Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
  const t = (Math.min(d, SOLID) - FLOOR) / (SOLID - FLOOR);
  ink[p] = t <= 0 ? 0 : Math.round(t * 255 * (a / 255));
}

/* ── find the drawing, and the seam between figure and wordmark ───────────── */

const rowInk = new Float64Array(H);
const colInk = new Float64Array(W);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const v = ink[y * W + x];
    rowInk[y] += v;
    colInk[x] += v;
  }
}

/** Ignore stray specks and JPEG noise; a real row of the drawing is far above. */
const rowFloor = Math.max(...rowInk) * 0.005;
const colFloor = Math.max(...colInk) * 0.005;

const firstOver = (arr, floor) => arr.findIndex((v) => v > floor);
const lastOver = (arr, floor) => arr.length - 1 - [...arr].reverse().findIndex((v) => v > floor);

const top = firstOver(rowInk, rowFloor);
const bottom = lastOver(rowInk, rowFloor);
const left = firstOver(colInk, colFloor);
const right = lastOver(colInk, colFloor);

if (top < 0 || left < 0) {
  console.log(c.bad('The source looks blank - no drawing found in it.'));
  process.exit(1);
}

/*
 * The lockup is a figure above a wordmark, separated by a band of empty rows.
 * The widest empty band inside the drawing is that gap, so splitting there
 * gives the figure alone - which is what belongs in a 16px tab icon, where the
 * word "FITDLE" would be an unreadable smudge.
 *
 * If no clear band exists the source is probably the figure on its own, and
 * everything falls back to using the whole drawing.
 */
let gapStart = -1;
let gapEnd = -1;
let run = -1;
for (let y = top; y <= bottom; y++) {
  if (rowInk[y] <= rowFloor) {
    if (run === -1) run = y;
  } else if (run !== -1) {
    if (y - run > gapEnd - gapStart) {
      gapStart = run;
      gapEnd = y;
    }
    run = -1;
  }
}

const drawingHeight = bottom - top;
const hasWordmark = gapStart !== -1 && gapEnd - gapStart > drawingHeight * 0.02;
const figureBottom = hasWordmark ? gapStart : bottom;

/** Horizontal extent of the figure alone - it is narrower than the wordmark. */
let figLeft = W;
let figRight = 0;
for (let y = top; y <= figureBottom; y++) {
  for (let x = 0; x < W; x++) {
    if (ink[y * W + x] > 8) {
      if (x < figLeft) figLeft = x;
      if (x > figRight) figRight = x;
    }
  }
}
if (figLeft > figRight) [figLeft, figRight] = [left, right];

const REGIONS = {
  figure: { left: figLeft, top, width: figRight - figLeft + 1, height: figureBottom - top + 1 },
  full: { left, top, width: right - left + 1, height: bottom - top + 1 },
};

/* ── emit ─────────────────────────────────────────────────────────────────── */

/** The ink map as an image, tinted flat. Alpha carries the shape. */
function tinted({ r, g, b }) {
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = ink[p];
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } });
}

const written = [];

/**
 * @param colour  fill for the shape
 * @param plate   background, or null to keep it transparent
 * @param pad     share of the canvas left as breathing room, 0-1
 */
async function emit(file, region, size, { colour, plate = null, pad = 0.1 }) {
  const box = Math.round(size * (1 - pad * 2));
  const scale = Math.min(box / region.width, box / region.height);
  const w = Math.max(1, Math.round(region.width * scale));
  const h = Math.max(1, Math.round(region.height * scale));

  const shape = await tinted(colour)
    .extract(region)
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    // Explicitly PNG: this pipeline starts from a raw buffer, so without a
    // format it hands back raw pixels that composite() cannot read.
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: size,
      height: Math.round(size),
      channels: 4,
      background: plate ? { ...plate, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await canvas
    .composite([{ input: shape, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(dest);

  written.push([file, `${size}px`]);
}

/**
 * The link-preview card.
 *
 * A bare logo on a plate is a wasted slot: the preview is the whole of what
 * someone sees before deciding whether to click, and a mark alone does not say
 * what the thing is. So the lockup sits above a one-line description of the
 * game, which is the only text most people will ever read about it.
 *
 * The caption is drawn as SVG text and baked in. That means it renders here,
 * once, rather than depending on a font being installed wherever this is
 * deployed - the output is a flat PNG committed to the repo.
 */
async function emitCard(file, region, width, height, { colour, plate, caption }) {
  const box = Math.min(width * 0.5, height * 0.66);
  const scale = Math.min(box / region.width, box / region.height);
  const w = Math.round(region.width * scale);
  const h = Math.round(region.height * scale);

  const shape = await tinted(colour)
    .extract(region)
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Lockup sits high, caption takes the space beneath it.
  const logoTop = Math.round(height * 0.5 - h / 2 - height * 0.06);

  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <text x="${width / 2}" y="${logoTop + h + Math.round(height * 0.08)}"
             text-anchor="middle" font-family="DejaVu Sans, sans-serif"
             font-size="30" letter-spacing="1" fill="#8fa3bf">${caption}</text>
     </svg>`,
  );

  const dest = path.join(root, file);
  await sharp({
    create: { width, height, channels: 4, background: { ...plate, alpha: 1 } },
  })
    .composite([
      { input: shape, left: Math.round((width - w) / 2), top: logoTop },
      { input: text, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(dest);

  written.push([file, `${width}x${height}`]);
}

console.log(c.head('\nBuilding logo assets'));
console.log(
  c.dim(
    `  source ${W}x${H}, ${transparentBg ? 'transparent' : 'flat'} background, ` +
      `${hasWordmark ? 'figure + wordmark' : 'figure only'}\n`,
  ),
);

// In-app marks. White, so the alpha channel is all that matters - the page
// masks these and supplies its own colour per theme.
await emit('public/mark.png', REGIONS.figure, 512, {
  colour: { r: 255, g: 255, b: 255 },
  pad: 0,
});
await emit('public/logo.png', REGIONS.full, 1024, {
  colour: { r: 255, g: 255, b: 255 },
  pad: 0,
});

// Tab and home-screen icons. Baked colours: nothing can tint these.
// On a plate rather than transparent, because a browser tab bar can be any
// colour and a bare silhouette disappears against half of them.
await emit('src/app/icon.png', REGIONS.figure, 512, { colour: ACCENT, plate: PLATE, pad: 0.14 });
await emit('src/app/apple-icon.png', REGIONS.figure, 180, {
  colour: ACCENT,
  plate: PLATE,
  pad: 0.14,
});

/*
 * Browser-extension icons.
 *
 * Emitted here rather than in the extension build so there is exactly one
 * place the logo is turned into pixels. The extension build previously carried
 * a hand-rolled PNG encoder drawing an approximation of a dumbbell, which was
 * the right call when the alternative was a binary asset in git and no image
 * dependency - but the real mark exists now and sharp is already installed.
 */
for (const size of [16, 48, 128]) {
  await emit(`assets/extension/icon${size}.png`, REGIONS.figure, size, {
    colour: ACCENT,
    plate: PLATE,
    pad: 0.12,
  });
}

// Link preview. The full lockup, since here there is room to read it.
await emitCard('src/app/opengraph-image.png', REGIONS.full, 1200, 630, {
  colour: PAPER,
  plate: PLATE,
  caption: 'Guess the daily exercise from its letters and the muscles it works.',
});

/*
 * Next serves src/app/favicon.ico at /favicon.ico ahead of anything generated
 * from icon.png, so leaving the starter one in place means the tab keeps
 * showing the Next.js logo no matter what else is emitted here.
 */
const stale = path.join(root, 'src/app/favicon.ico');
if (fs.existsSync(stale)) {
  fs.rmSync(stale);
  console.log(c.dim('  removed the starter src/app/favicon.ico\n'));
}

for (const [file, size] of written) console.log(`  ${c.ok('✓')} ${file.padEnd(32)} ${c.dim(size)}`);
console.log(c.ok('\nDone. Commit these - the build does not regenerate them.\n'));
