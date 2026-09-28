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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/*
 * Console errors that are not the app's fault.
 *
 * This used to be `!/404/.test(t)`, which drops ANY console error whose text
 * happens to contain "404" - including a real one that mentions a status code
 * in passing. What it meant to forgive is a missing static asset, so that is
 * what it says now: the browser's own resource-load failure, and nothing else.
 */
const IGNORED_ERROR = /Failed to load resource:.*\b40[34]\b/i;

/** Pulls a guessable name of the given length out of the in-app exercise list. */
async function wordOfLength(page, n) {
  await page.click('button:has-text("Exercise list")');
  await page.waitForSelector('[role="dialog"]');
  const words = await page.evaluate((len) => {
    const dialog = document.querySelector('[role="dialog"]');
    const exact = new RegExp(`^[A-Z]{${len}}$`);
    return [
      ...new Set(
        [...dialog.querySelectorAll('*')]
          .filter((e) => e.children.length === 0)
          .map((e) => e.textContent?.trim())
          .filter((t) => t && exact.test(t)),
      ),
    ];
  }, n);
  await page.click('[role="dialog"] button[aria-label="Close"]');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  return words[0] ?? null;
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

    /*
     * Playwright is a devDependency; its BROWSERS are not, and `npm ci` does
     * not fetch them. On a clean checkout this threw an uncaught TimeoutError
     * out of the script - so the one step that exists because unit tests missed
     * two real regressions could not run at all, and said so in a stack trace
     * at the end of a pipeline whose seven earlier steps had just gone green.
     */
    let browser;
    try {
      browser = await chromium.launch();
    } catch (err) {
      const missing = /Executable doesn't exist|playwright install/i.test(String(err));
      console.log(c.bad(missing ? '✗ no browser to drive' : `✗ could not launch a browser`));
      console.log(
        c.dim(
          missing
            ? '  Playwright is installed but its browsers are not. Fetch them once:  npx playwright install'
            : `  ${String(err).split('\n')[0]}`,
        ),
      );
      failures++;
      return;
    }
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

    const violations = [];
    const errors = [];

    /*
     * Every API payload the page receives, kept as text.
     *
     * The answer-leak question is not "is the schedule in the bundle" - that is
     * `check:bundle` - but "does the running server hand the answer to a player
     * who has not finished". Nothing checked that. Once the round ends the
     * reveal names the answer, and every payload captured BEFORE that point can
     * be searched for it retrospectively.
     */
    const payloads = [];
    page.on('response', (res) => {
      if (!res.url().includes('/api/')) return;
      payloads.push(
        res
          .text()
          .then((body) => ({ url: res.url(), body }))
          .catch(() => null),
      );
    });
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 120));
      else if (m.type() === 'error' && !IGNORED_ERROR.test(t)) errors.push(t.slice(0, 120));
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

    /*
     * The anatomy drill is embedded in the landing page as the one interactive
     * island on an otherwise static server component. It is client-only, so
     * nothing server-side can tell whether it still runs, and `npm test` only
     * covers the question generator.
     */
    await page.click('button:has-text("Start drill")').catch(() => {});
    await sleep(1200);
    const drill = await page.evaluate(() => ({
      options: [...document.querySelectorAll('button')]
        .map((b) => b.textContent?.trim())
        .filter((t) => t && t.length > 1 && t.length < 20).length,
      figure: document.querySelectorAll('svg').length,
    }));

    await page.goto(`http://localhost:${mode.port}/play`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());

    /*
     * ── The theme has to be right before the first paint ────────────────────
     *
     * The settings store applies it from a useEffect, so until `/theme.js`
     * existed a player on Daylight got a full dark-to-light flash on every
     * load, and the landing page - a server component with no settings store -
     * never got the theme at all. Both are properties of the served HTML, so
     * nothing but a browser can see them.
     *
     * Read at DOMContentLoaded: the blocking script has run, React has not
     * hydrated.
     */
    await page.evaluate(() =>
      localStorage.setItem(
        'fitdle:settings:v1',
        JSON.stringify({ colourblind: false, reduceMotion: false, theme: 'daylight' }),
      ),
    );
    const themed = {};
    for (const path of ['/play', '/']) {
      const probe = await page.context().newPage();
      await probe.goto(`http://localhost:${mode.port}${path}`, { waitUntil: 'domcontentloaded' });
      themed[path] = await probe.evaluate(() => {
        const tag = document.querySelector('script[src="/theme.js"]');
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          bg: getComputedStyle(document.body).backgroundColor,
          /*
           * Reading at DOMContentLoaded cannot tell a blocking script from a
           * deferred one - deferred scripts have already run by then, so
           * adding `defer` passed both checks above while reintroducing the
           * flash. The DOM says what the server actually sent.
           */
          blocking: Boolean(tag) && !tag.defer && !tag.async,
        };
      });
      await probe.close();
    }
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
      [
        'the embedded drill starts and offers answers',
        drill.options >= 3 && drill.figure >= 1,
        `${drill.options} option(s), ${drill.figure} figure(s)`,
      ],
      [
        'the saved theme is applied before the first paint',
        themed['/play'].theme === 'daylight' && themed['/'].theme === 'daylight',
        `/play ${themed['/play'].theme}, / ${themed['/'].theme}`,
      ],
      [
        'and the light theme really is light on both pages',
        themed['/play'].bg === 'rgb(245, 247, 250)' && themed['/'].bg === 'rgb(245, 247, 250)',
        `/play ${themed['/play'].bg}, / ${themed['/'].bg}`,
      ],
      [
        'the theme script is served blocking, not deferred',
        themed['/play'].blocking && themed['/'].blocking,
        `/play ${themed['/play'].blocking}, / ${themed['/'].blocking}`,
      ],
      ['no CSP violations', violations.length === 0, violations[0] ?? ''],
      ['no console errors', errors.length === 0, errors[0] ?? ''],
    ];

    // Typing must reach the server and come back scored.
    await page.keyboard.press('P');
    const typed = await page.evaluate(
      () => document.querySelector('.tile-face:not(.tile-face-back)')?.textContent,
    );
    results.push(['keyboard input registers', typed === 'P', `saw "${typed}"`]);
    await page.keyboard.press('Backspace');

    /*
     * ── Play a whole round, through the UI, against the real server ─────────
     *
     * Everything above this line checks that the page came up. That is what the
     * two historic regressions needed and it is not enough: the guess round
     * trip, the scoring, the reveal and the answer gate are all properties of
     * the running server, and none of them had a browser check. Three separate
     * bugs found in this repo lived in exactly that space - a leaderboard that
     * could never have a row, a 500 on the winning guess, and a reset that
     * silently did nothing.
     *
     * Guesses come from the in-app exercise list, which is where a player gets
     * them, so this needs no copy of the word list and cannot drift from one.
     */
    /*
     * The muscle figure must not be interactive while the round is live.
     *
     * The figure already tells you which muscles the answer shares and the
     * board tells you its length, so a list of "exercises that train this" is
     * the third side of an intersection the player did not earn - measured over
     * the schedule, tapping one lit muscle leaves 7.1 same-length candidates
     * and sometimes exactly one. The gate is that the regions carry no click
     * handler, no role and no label until the round ends, which nothing but a
     * browser can see.
     */
    const regionsMidRound = await page.evaluate(
      () => document.querySelectorAll('svg [role="button"]').length,
    );

    await page.click('button:has-text("Exercise list")');
    await page.waitForSelector('[role="dialog"]');
    const candidates = await page.evaluate((n) => {
      const dialog = document.querySelector('[role="dialog"]');
      const exact = new RegExp(`^[A-Z]{${n}}$`);
      return [
        ...new Set(
          [...dialog.querySelectorAll('*')]
            .filter((e) => e.children.length === 0)
            .map((e) => e.textContent?.trim())
            .filter((t) => t && exact.test(t)),
        ),
      ];
    }, dom.cols);
    await page.click('[role="dialog"] button[aria-label="Close"]');
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });

    /*
     * Type a word and confirm it landed, rather than sleeping and hoping.
     *
     * The client ignores keystrokes while a row is revealing, and the reveal is
     * `0.5 s + 0.075 s per tile` (DECISIONS §5), so the right interval depends
     * on the day's column count. Two attempts at a fixed wait were wrong here:
     * the obvious signal - the back faces taking a result colour - is useless,
     * because the back face is painted from the start and merely rotated away
     * by `backface-visibility`. It reads as "revealed" before the flip begins,
     * so the next guess was typed into a board that was ignoring input and the
     * run died 20 s later on a request that was never made.
     *
     * Typing and checking needs no timing constant at all.
     */
    const typeWord = async (rowIndex, word) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await page.keyboard.type(word, { delay: 15 });
        const landed = await page.evaluate(
          ({ rowIndex: r, word: w }) => {
            const row = document.querySelectorAll('[role="row"]')[r];
            if (!row) return false;
            return (
              [...row.querySelectorAll('.tile-face:not(.tile-face-back)')]
                .map((e) => e.textContent)
                .join('') === w
            );
          },
          { rowIndex, word },
        );
        if (landed) return true;
        for (let i = 0; i < word.length; i += 1) await page.keyboard.press('Backspace');
        await sleep(150);
      }
      return false;
    };

    let played = 0;
    const rowColours = [];
    const playedWords = [];
    let roundStatus = 'playing';
    let typingFailed = null;

    for (const word of candidates.slice(0, 6)) {
      if (!(await typeWord(played, word))) {
        typingFailed = word;
        break;
      }

      const scored = page.waitForResponse((r) => r.url().includes('/api/guess'), {
        timeout: 20_000,
      });
      await page.keyboard.press('Enter');

      /*
       * The round is over when the SERVER says so, not when the modal appears:
       * the result modal is opened by a timer 0.9-1.5 s after the last row
       * flips, so a loop watching for a dialog plays one guess too many.
       */
      const payload = await (await scored).json().catch(() => ({}));
      if (payload.ok === false) continue; // a rejected word costs no guess
      played += 1;
      roundStatus = payload.status ?? roundStatus;

      rowColours.push(
        await page.evaluate(
          (r) =>
            [
              ...document.querySelectorAll('[role="row"]')[r].querySelectorAll('.tile-face-back'),
            ].map((f) => getComputedStyle(f).backgroundColor),
          played - 1,
        ),
      );
      playedWords.push(word);

      if (roundStatus !== 'playing') break;
    }

    // Now the modal is allowed to take its time.
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 }).catch(() => {});

    /*
     * ── Practice mode ───────────────────────────────────────────────────────
     *
     * Two claims the README makes about it, neither of which anything checked:
     * that it "stays fully local" - no round trip per guess - and that practice
     * rounds "are never written to storage, so there is no path from a practice
     * round to a streak". Both are properties of the running client, so a
     * regression in either is invisible to every server-side test.
     */
    const regionsAfterRound = await page.evaluate(
      () => document.querySelectorAll('svg [role="button"]').length,
    );

    /*
     * ── Can the game be played without sight, or without a mouse? ───────────
     *
     * Neither was true, and neither is visible to any other check here.
     *
     * The board's scoring lives entirely in the tiles' background colours, and
     * both faces of a tile render the same letter - so a scored row read out as
     * "SS EE AA" with no indication of green, yellow or grey. The only live
     * region in the app was the toast, which carries rejections and never
     * results.
     *
     * And the dialogs: measured with "How to play" open, focus stayed on the
     * trigger behind the overlay, one Tab walked out into a page hidden behind
     * a backdrop blur, and Escape left focus wherever the tabbing had gone.
     */
    const spoken = await page.evaluate(() => {
      const row = document.querySelectorAll('[role="row"]')[0];
      const live = document.querySelector('[role="grid"] [role="status"]');
      const box = live ? getComputedStyle(live) : null;
      return {
        cells: [...row.querySelectorAll('[role="gridcell"]')].map((c) =>
          c.getAttribute('aria-label'),
        ),
        facesHidden: [...row.querySelectorAll('.tile-face')].every(
          (f) => f.getAttribute('aria-hidden') !== null,
        ),
        rowLabel: row.getAttribute('aria-label'),
        announced: live?.textContent?.trim() ?? '',
        hidden: box ? box.position === 'absolute' && parseFloat(box.width) <= 1 : false,
      };
    });

    results.push(
      [
        'a scored tile says its letter AND its state',
        spoken.cells.length > 0 &&
          spoken.cells.every((l) => /^[A-Z], (correct|in the word, wrong place|not in the word)$/.test(l ?? '')),
        spoken.cells.slice(0, 2).join(' / '),
      ],
      [
        'and says each letter once, not twice',
        spoken.facesHidden,
        spoken.facesHidden ? 'both faces hidden from the tree' : 'a tile face is still readable',
      ],
      [
        'the row announces the whole result',
        /^Guess \d+: [A-Z] /.test(spoken.announced) && spoken.hidden,
        `${spoken.announced.slice(0, 44)}… (visually hidden: ${spoken.hidden})`,
      ],
      ['rows are numbered for a screen reader', /^Guess \d+ of \d+$/.test(spoken.rowLabel ?? ''), spoken.rowLabel ?? ''],
    );

    // Read the result screen before anything closes it - practice comes next,
    // and it needs the modal out of the way.
    const modalText = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.textContent ?? '',
    );

    await page.keyboard.press('Escape');
    await sleep(600);
    const apiBefore = payloads.length;
    const saveBefore = await page.evaluate(() => localStorage.getItem('fitdle:save:v2'));

    let practice = { cols: 0, scored: false, apiCalls: 0, wroteSave: true };
    try {
      await page.click('button:has-text("Practice mode")', { timeout: 5_000 });
      await sleep(1200);
      practice.cols = await page.evaluate(
        () =>
          document.querySelectorAll('[role="row"]')[0]?.querySelectorAll('.tile-perspective')
            .length ?? 0,
      );

      const word = candidates.find((w) => w.length === practice.cols) ?? (await wordOfLength(page, practice.cols));
      if (word && (await typeWord(0, word))) {
        await page.keyboard.press('Enter');
        await sleep(2_000);
        practice.scored = await page.evaluate(() =>
          [...document.querySelectorAll('[role="row"]')[0].querySelectorAll('.tile-face-back')].some(
            (f) => getComputedStyle(f).backgroundColor !== 'rgba(0, 0, 0, 0)',
          ),
        );
      }
      practice.apiCalls = payloads.length - apiBefore;
      practice.wroteSave =
        (await page.evaluate(() => localStorage.getItem('fitdle:save:v2'))) !== saveBefore;
    } catch {
      /* reported by the checks below */
    }

    /*
     * Dialog focus, run here because the result modal has to be out of the way
     * first - it is a full-screen overlay and it intercepts every click.
     */
    const focusReport = await (async () => {
      const at = () =>
        page.evaluate(() => {
          const a = document.activeElement;
          return {
            inDialog: Boolean(a?.closest('[role="dialog"]')),
            name: a?.getAttribute('aria-label') ?? a?.textContent?.trim().slice(0, 24) ?? '',
          };
        });
      await page.click('button:has-text("How to play")');
      await page.waitForSelector('[role="dialog"]');
      const opened = await at();
      let escaped = false;
      for (let i = 0; i < 12 && !escaped; i += 1) {
        await page.keyboard.press('Tab');
        escaped = !(await at()).inDialog;
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { state: 'detached' }).catch(() => {});
      await sleep(400);
      const restored = await at();
      return { opened, escaped, restored };
    })();


    results.push(
      [
        'opening a dialog moves focus into it',
        focusReport.opened.inDialog,
        `focus on "${focusReport.opened.name}"`,
      ],
      ['and Tab cannot leave it', !focusReport.escaped, focusReport.escaped ? 'focus escaped' : '12 tabs, still inside'],
      [
        'and closing gives focus back to the trigger',
        /How to play/i.test(focusReport.restored.name),
        `focus on "${focusReport.restored.name}"`,
      ],
    );

    const bodies = (await Promise.all(payloads)).filter(Boolean);
    const revealed = bodies.filter((b) => /"reveal":\{/.test(b.body));
    let answer = null;
    try {
      answer = revealed.length ? JSON.parse(revealed[revealed.length - 1].body).reveal.name : null;
    } catch {
      /* keep answer null; the assertion below reports it */
    }

    /*
     * The reveal has to look like an answer, not merely exist. An empty string
     * satisfies `modalText.includes(answer)` for any modal at all, so the shape
     * is checked before anything is concluded from it.
     */
    if (answer !== null && !/^[A-Z]{4,10}$/.test(answer)) answer = null;

    const duringPlay = bodies.filter((b) => /"status":"playing"/.test(b.body));
    const leaks = answer ? duringPlay.filter((b) => b.body.includes(answer)) : [];

    // The spec's three result colours, asserted as computed values.
    const GREEN = 'rgb(34, 197, 94)';
    const YELLOW = 'rgb(234, 179, 8)';
    const GREY = 'rgb(75, 85, 99)';
    const RESULT_COLOURS = [GREEN, YELLOW, GREY];

    const firstRowColours = rowColours[0] ?? [];
    const scoredByServer =
      firstRowColours.length === dom.cols &&
      firstRowColours.every((col) => RESULT_COLOURS.includes(col));

    /*
     * A weaker invariant than "the scoring is correct", and deliberately so.
     *
     * Every tile taking *a* result colour is not evidence of scoring: with
     * `evaluateGuess` returning `absent` for everything, the board is uniformly
     * grey and still passes that check - measured, by doing exactly that. The
     * duplicate-letter rules and position-before-presence belong to
     * `tests/evaluate.ts`; re-deriving them here would put a second copy of the
     * algorithm in the smoke script, which is the thing this codebase keeps
     * refusing to do.
     *
     * So: a guess that shares a letter with the answer must light SOMETHING.
     * That holds for any correct scoring, needs no copy of the rules, and is
     * not luck - whether a shared letter exists is checked, not assumed.
     */
    const shouldLight =
      answer === null
        ? []
        : playedWords
            .map((word, i) => ({ word, colours: rowColours[i] ?? [] }))
            .filter(({ word }) => [...word].some((ch) => answer.includes(ch)));
    const litRows = shouldLight.filter(({ colours }) =>
      colours.some((col) => col === GREEN || col === YELLOW),
    );
    const scoringIsReal = shouldLight.length > 0 && litRows.length === shouldLight.length;

    results.push(
      ['a guess reaches the server and comes back scored', scoredByServer, firstRowColours.join(' ')],
      [
        'a guess sharing a letter with the answer lights a tile',
        scoringIsReal,
        shouldLight.length === 0
          ? 'no guess shared a letter - nothing to check'
          : `${litRows.length}/${shouldLight.length} such row(s) lit`,
      ],
      [
        'the round plays to a finish',
        answer !== null && roundStatus !== 'playing' && !typingFailed,
        typingFailed
          ? `the board stopped accepting input at "${typingFailed}"`
          : `${played} guess(es), ${roundStatus}`,
      ],
      [
        'the answer is absent from every payload sent mid-round',
        answer !== null && leaks.length === 0,
        `${duringPlay.length} payload(s) checked for "${answer ?? '?'}"`,
      ],
      [
        'the muscle figure is not tappable mid-round',
        regionsMidRound === 0,
        `${regionsMidRound} tappable region(s) while playing`,
      ],
      [
        'and becomes tappable once the round is over',
        regionsAfterRound > 0,
        `${regionsAfterRound} region(s) after`,
      ],
      [
        'practice scores locally, with no server call',
        practice.cols >= 5 && practice.scored && practice.apiCalls === 0,
        `${practice.cols} columns, ${practice.apiCalls} API call(s)`,
      ],
      [
        'a practice round cannot reach the streak',
        practice.wroteSave === false,
        practice.wroteSave ? 'it wrote the save' : 'storage untouched',
      ],
      [
        'the result screen reveals the answer',
        answer !== null && modalText.includes(answer),
        answer === null
          ? 'no reveal came back'
          : modalText.includes(answer)
            ? `modal names ${answer}`
            : `modal does not name ${answer} (${modalText.length} chars)`,
      ],
    );

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

/**
 * The extension popup, loaded into a real Chromium.
 *
 * `build:extension` succeeding proves the files were written. It does not prove
 * the popup runs, and for a long time it did not: the build renamed `_next` to
 * `next-assets` and rewrote the HTML to match, but the chunk paths baked into
 * the runtime still said `/_next/...`, so React waited forever for a chunk it
 * already had. No error, no failed request, no console output - a popup stuck
 * at `opacity: 0`. Every check in this repo passed throughout, because the only
 * thing anyone verified was that the output contained no inline scripts.
 *
 * So this loads the built extension and drives the popup. It is the same
 * assertion the dev/prod modes make - "React actually hydrated" - against the
 * one artefact that has no server to serve it.
 */
async function checkExtension() {
  console.log(c.head(`\n── extension ────────────────────────────────────`));

  if (!existsSync(path.join(root, 'extension-dist', 'manifest.json'))) {
    console.log(c.bad('✗ no extension-dist/ - run `npm run build:extension` first'));
    failures++;
    return;
  }

  const { chromium } = await import('playwright');
  const profile = mkdtempSync(path.join(tmpdir(), 'fitdle-ext-'));
  const dist = path.join(root, 'extension-dist');
  const manifestOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
      viewport: { width: 420, height: 640 },
    });
  } catch (err) {
    console.log(c.bad('✗ could not launch a browser with the extension loaded'));
    console.log(c.dim(`  ${String(err).split('\n')[0]}`));
    failures++;
    return;
  }

  try {
    await sleep(2500);
    const manager = await ctx.newPage();
    await manager.goto('chrome://extensions/');
    await sleep(900);
    const id = await manager
      .evaluate(() => {
        const mgr = document.querySelector('extensions-manager');
        const items = mgr?.shadowRoot
          ?.querySelector('extensions-item-list')
          ?.shadowRoot?.querySelectorAll('extensions-item');
        return items && items.length ? items[0].getAttribute('id') : null;
      })
      .catch(() => null);
    await manager.close();

    const results = [['Chromium accepts the unpacked extension', Boolean(id), id ?? 'not loaded']];

    if (id) {
      const popup = await ctx.newPage();
      const violations = [];
      const errors = [];
      popup.on('console', (m) => {
        const t = m.text();
        if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 120));
        else if (m.type() === 'error' && !IGNORED_ERROR.test(t)) errors.push(t.slice(0, 120));
      });
      popup.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

      await popup.goto(`chrome-extension://${id}/play.html`, { waitUntil: 'networkidle' });
      await sleep(3500);

      const dom = await popup.evaluate(() => ({
        opacity: getComputedStyle(document.querySelector('main')).opacity,
        cols:
          document.querySelectorAll('[role="row"]')[0]?.querySelectorAll('.tile-perspective')
            .length ?? 0,
        keyboard: document.querySelectorAll('[aria-label="Keyboard"]').length,
        inline: [...document.querySelectorAll('script')].filter((sc) => !sc.src).length,
        body: document.body.innerText ?? '',
        puzzle: /Puzzle #-\d+/.test(document.body.innerText ?? ''),
      }));

      await popup.keyboard.press('P');
      await sleep(400);
      const typed = await popup.evaluate(
        () => document.querySelector('.tile-face:not(.tile-face-back)')?.textContent,
      );

      results.push(
        ['the popup hydrates (main is visible)', dom.opacity === '1', `opacity ${dom.opacity}`],
        ['the board renders at popup width', dom.cols >= 5 && dom.cols <= 9, `${dom.cols} columns`],
        ['the keyboard is present', dom.keyboard === 1],
        ["MV3 forbids inline scripts, and there are none", dom.inline === 0, `${dom.inline} inline`],
        ['no CSP violations in the popup', violations.length === 0, violations[0] ?? ''],
        [
          'no nonsense puzzle number',
          !dom.puzzle,
          dom.puzzle ? 'rendered a negative puzzle number' : '',
        ],
      );

      /*
       * A static export has no server, so what the popup can do depends on
       * whether the build was given one. Both configurations are real and both
       * are asserted - the unconfigured one because that is what `verify`
       * builds, and leaving it unchecked is how the popup was dead for months.
       */
      const configured = (manifestOf(dist).host_permissions ?? []).some((h) =>
        /^https?:\/\/(?!.*supabase)/.test(h),
      );

      if (configured) {
        results.push(
          ['typing reaches the board', typed === 'P', `saw "${typed}"`],
          ['no console errors in the popup', errors.length === 0, errors[0] ?? ''],
        );
      } else {
        results.push(
          [
            'an unconfigured build says so instead of looking broken',
            /Cannot reach the server/i.test(dom.body),
            'NEXT_PUBLIC_API_URL was not set at build time',
          ],
          [
            'and offers a retry rather than a dead board',
            /Try again/i.test(dom.body),
            '',
          ],
        );
      }
    }

    for (const [name, ok, detail] of results) {
      if (!ok) failures++;
      console.log(`  ${ok ? c.ok('✓') : c.bad('✗')} ${name}${detail ? c.dim(`  ${detail}`) : ''}`);
    }
  } finally {
    await ctx.close().catch(() => {});
    rmSync(profile, { recursive: true, force: true });
  }
}

/**
 * A crash in one mode is a failed check, not the end of the run.
 *
 * `check()` drives a browser through a dozen navigations, and any of them can
 * throw for reasons that have nothing to do with the app - a loaded machine
 * answering `net::ERR_INSUFFICIENT_RESOURCES` on the first `page.goto`, which
 * is exactly what happened here. That escaped as an uncaught exception, so the
 * run ended in a stack trace with no check results at all and no attempt at the
 * other modes. The failure was real; the reporting was useless.
 */
async function guarded(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.log(c.bad(`✗ ${name} crashed before it could finish`));
    console.log(c.dim(`  ${String(err).split('\n')[0]}`));
    failures++;
  }
}

for (const mode of MODES) await guarded(mode.name, () => check(mode));
if (wanted.length === 0 || wanted.includes('extension')) {
  await guarded('extension', checkExtension);
}

console.log();
if (failures > 0) {
  console.log(c.bad(`${failures} smoke check(s) failed.`));
  process.exit(1);
}
console.log(c.ok('Smoke checks passed in every mode.'));
