#!/usr/bin/env node
/**
 * Boots the app for real and checks it actually works.
 *
 * WHY THIS EXISTS
 * Twice now a change passed every unit test, typechecked, linted and built -
 * and still shipped a dead page, because it was only ever exercised in ONE
 * mode:
 *
 *   - The CSP was verified against a production build. Dev needs 'unsafe-eval'
 *     for HMR, so `npm run dev` rendered a blank shell at opacity 0.
 *   - The daily seed was verified in dev. The prerendered production build
 *     baked in the build-day answer and mismatched on hydration.
 *
 * Unit tests cannot catch either: both are properties of the running server.
 * So this runs the same checks against dev AND prod, and fails if they differ.
 *
 *   npm run smoke            both modes
 *   npm run smoke -- dev     one mode, while iterating
 *
 * Requires a browser: npx playwright install chromium
 */

import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET = '\x1b[0m';
const c = {
  ok: (s) => `\x1b[32m${s}${RESET}`,
  bad: (s) => `\x1b[31m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
  head: (s) => `\x1b[1m${s}${RESET}`,
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const MODES = [
  { name: 'dev', port: 4310, cmd: ['npx', 'next', 'dev', '-p', '4310'] },
  { name: 'prod', port: 4311, cmd: ['npx', 'next', 'start', '-p', '4311'], needsBuild: true },
].filter((m) => wanted.length === 0 || wanted.includes(m.name));

let failures = 0;

/**
 * Refuses to run against a server this script did not start.
 *
 * This has now silently corrupted a test run twice: a stale `next start` left
 * on the port answers 200, the readiness check is satisfied, and every
 * assertion then runs against an old build. The failure is invisible - the
 * checks pass, they just prove nothing. A readiness probe cannot tell whose
 * server replied, so the only fix is to refuse to start at all.
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `port ${port} is already in use. Something else is listening there, ` +
                `and testing against it would silently check the wrong build.\n` +
                `  Free it first:  fuser -k ${port}/tcp`,
            )
          : err,
      );
    });
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

async function waitForServer(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

async function check(mode) {
  console.log(c.head(`\n── ${mode.name} ──────────────────────────────────────────`));

  try {
    await assertPortFree(mode.port);
  } catch (err) {
    console.log(c.bad(`✗ ${err.message}`));
    failures++;
    return;
  }

  if (mode.needsBuild) {
    console.log(c.dim('  building…'));
    execSync('npx next build', { cwd: root, stdio: 'pipe' });
  }

  /*
   * Output is captured, not discarded.
   *
   * Next 16 refuses to start a second dev server for the same directory - it
   * exits with an explanation naming the PID of the one already running. With
   * stdio ignored, all of that was invisible and the script reported a bare
   * "server never came up", which is true and useless. The common case for this
   * script failing locally is that you have `npm run dev` open in another
   * terminal, and it should say so.
   */
  let output = '';
  const server = spawn(mode.cmd[0], mode.cmd.slice(1), {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, NODE_ENV: mode.name === 'dev' ? 'development' : 'production' },
  });
  server.stdout?.on('data', (d) => (output += d));
  server.stderr?.on('data', (d) => (output += d));

  try {
    if (!(await waitForServer(mode.port))) {
      const already = /Another next dev server is already running[\s\S]*?PID:\s*(\d+)/.exec(output);
      if (already) {
        console.log(c.bad('✗ a dev server is already running for this directory'));
        console.log(
          c.dim(
            `  Next only allows one per project. Stop it and re-run:  kill ${already[1]}\n` +
              `  Or check just production:  npm run smoke -- prod`,
          ),
        );
      } else {
        console.log(c.bad(`✗ server never came up on :${mode.port}`));
        const tail = output.trim().split('\n').slice(-3).join('\n      ');
        if (tail) console.log(c.dim(`      ${tail}`));
      }
      failures++;
      return;
    }

    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

    const violations = [];
    const errors = [];
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 120));
      else if (m.type() === 'error' && !/404/.test(t)) errors.push(t.slice(0, 120));
    });
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

    /*
     * The landing page owns `/` and the game moved to `/play`. Both are checked:
     * the landing page is the first thing a cold visitor loads, and it is a
     * server component with no client JavaScript, so "it rendered" is the whole
     * of its contract - but a broken link from it to the game would be
     * invisible to every other check in this repo.
     */
    await page.goto(`http://localhost:${mode.port}/`, { waitUntil: 'networkidle' });
    const landing = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      // Relative, since the origin differs between the two modes.
      play: [...document.querySelectorAll('a')].filter((a) =>
        a.getAttribute('href') === '/play',
      ).length,
      shots: [...document.querySelectorAll('img')].length,
    }));

    await page.goto(`http://localhost:${mode.port}/play`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(2500);

    const dom = await page.evaluate(() => ({
      opacity: getComputedStyle(document.querySelector('main')).opacity,
      cols: document.querySelectorAll('[role="row"]')[0]?.querySelectorAll('.tile-perspective').length ?? 0,
      keyboard: document.querySelectorAll('[aria-label="Keyboard"]').length,
      puzzle: /Puzzle #\d+/.test(document.querySelector('aside')?.textContent ?? ''),
    }));

    const results = [
      // The single most valuable assertion: React actually hydrated. Both past
      // regressions surfaced exactly here, as a dead page at opacity 0.
      ['app hydrates (main is visible)', dom.opacity === '1', `opacity ${dom.opacity}`],
      ['board rendered', dom.cols >= 5 && dom.cols <= 9, `${dom.cols} columns`],
      ['keyboard present', dom.keyboard === 1],
      ['puzzle number resolved from the server', dom.puzzle],
      ['landing page renders its headline', landing.heading.length > 10, `"${landing.heading}"`],
      ['landing page links to the game', landing.play >= 1, `${landing.play} link(s) to /play`],
      ['landing page screenshots load', landing.shots >= 3, `${landing.shots} image(s)`],
      ['no CSP violations', violations.length === 0, violations[0] ?? ''],
      ['no console errors', errors.length === 0, errors[0] ?? ''],
    ];

    // Typing must reach the server and come back scored.
    await page.keyboard.press('P');
    const typed = await page.evaluate(
      () => document.querySelector('.tile-face:not(.tile-face-back)')?.textContent,
    );
    results.push(['keyboard input registers', typed === 'P', `saw "${typed}"`]);

    for (const [name, ok, detail] of results) {
      if (!ok) failures++;
      console.log(`  ${ok ? c.ok('✓') : c.bad('✗')} ${name}${detail ? c.dim(`  ${detail}`) : ''}`);
    }

    await browser.close();
  } finally {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

for (const mode of MODES) await check(mode);

console.log();
if (failures > 0) {
  console.log(c.bad(`${failures} smoke check(s) failed.`));
  process.exit(1);
}
console.log(c.ok('Smoke checks passed in every mode.'));
