import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
  CalendarClock,
  Flame,
  Gauge,
  Repeat,
  Share2,
  Smartphone,
  Target,
  Trophy,
} from 'lucide-react';
import { AnatomyDrill } from '@/components/AnatomyDrill';
import { Lockup, Mark } from '@/components/Wordmark';
import { CATALOGUE, CATEGORY_HINT_AT, MAX_GUESSES } from '@/data/exercises';
import { SCHEDULE_SIZE } from '@/server/game';

/**
 * The landing page.
 *
 * ── Two things worth knowing before editing ─────────────────────────────────
 *
 * It is a SERVER component with no client JavaScript at all. No framer-motion,
 * no state, no store. Everything that moves is CSS. That is deliberate: this is
 * the page a cold visitor loads first, and every kilobyte here is paid before
 * anyone has decided whether they care. The game at /play is where the
 * interactivity lives.
 *
 * Every number on the page is READ FROM THE DATA rather than typed. The first
 * version of this copy went out with "100 exercises" when there were 99, and a
 * marketing page that misstates the product is worse than one that says less.
 * If a claim here cannot be derived from a constant, it should be a claim about
 * design rather than a number.
 */

export const metadata: Metadata = {
  title: 'Fitdle - Guess the daily exercise from the muscles it works',
  description:
    'A daily exercise deduction game. Six guesses, one hidden move, and an anatomical figure that reacts to every wrong answer. Free, no account needed.',
};

/* ── copy that is derived, not typed ──────────────────────────────────────── */

const EXERCISE_COUNT = CATALOGUE.length;
const LENGTHS = [...new Set(CATALOGUE.map((e) => e.name.length))].sort((a, b) => a - b);
const MIN_LEN = LENGTHS[0];
const MAX_LEN = LENGTHS[LENGTHS.length - 1];

const STATS = [
  { value: String(EXERCISE_COUNT), label: 'exercises' },
  { value: String(MAX_GUESSES), label: 'guesses a day' },
  { value: `${MIN_LEN}-${MAX_LEN}`, label: 'letters' },
  { value: String(SCHEDULE_SIZE), label: 'day rotation' },
];

const STEPS = [
  {
    n: '01',
    title: 'Type an exercise',
    body: `Any of the ${EXERCISE_COUNT} in the list. The tiles score like Wordle: green is the right letter in the right place, yellow is the right letter somewhere else, grey is not in the answer.`,
  },
  {
    n: '02',
    title: 'Watch the figure',
    body: 'The anatomy panel updates on every guess. It shows you what the letters cannot: which muscles the answer shares with your guess, and which it definitely does not.',
  },
  {
    n: '03',
    title: 'Read the width',
    body: `The grid is ${MIN_LEN} to ${MAX_LEN} tiles wide and changes daily. You know how long the answer is before you have typed anything.`,
  },
  {
    n: '04',
    title: 'Narrow it down',
    body: `Two channels of evidence, ${MAX_GUESSES} guesses. A wrong answer is never wasted, because it still eliminates a region of the body.`,
  },
];

const STATES = [
  {
    label: 'Shared',
    swatch: 'bg-state-correct',
    body: 'Your guess and the answer both work this muscle.',
  },
  {
    label: 'Ruled out',
    swatch: 'bg-figure-missed',
    body: 'Your guess works it, the answer does not.',
  },
  {
    label: 'Unknown',
    swatch: 'bg-tile-filled',
    body: 'No guess has touched it yet, so it tells you nothing.',
  },
  {
    label: 'Target area',
    swatch: 'border-2 border-dashed border-state-present bg-transparent',
    body: `From guess ${CATEGORY_HINT_AT}, a dashed ring marks the answer's muscle group - and only on muscles you have not probed.`,
  },
];

const FEATURES = [
  {
    icon: Flame,
    title: 'Streaks',
    body: 'Recorded by the server when the round ends, so they cannot be faked from the browser.',
  },
  {
    icon: Trophy,
    title: 'Leaderboard',
    body: "Longest current streaks, and everyone who solved today by fewest guesses.",
  },
  {
    icon: Activity,
    title: 'Anatomy drill',
    body: 'A 30-second warm-up: name the muscle an exercise works by tapping the figure.',
  },
  {
    icon: Share2,
    title: 'Shareable grids',
    body: 'The emoji block everyone expects, with the muscle result alongside it.',
  },
  {
    icon: Repeat,
    title: 'Practice mode',
    body: 'Unlimited random rounds. They never touch your streak.',
  },
  {
    icon: Gauge,
    title: 'Five themes',
    body: 'Plus a colourblind mode that layers on any of them, and reduced motion.',
  },
];

/* ── small pieces ─────────────────────────────────────────────────────────── */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <p className="font-game text-xs font-bold tracking-[0.28em] text-accent uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 max-w-3xl text-2xl font-bold text-balance text-white sm:text-4xl">
        {title}
      </h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

/** A screenshot, framed so it reads as a window rather than a floating image. */
function Shot({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-tile-border bg-surface shadow-2xl shadow-black/40 ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export default function Landing() {
  return (
    <div className="flex min-h-full flex-col bg-app-bg">
      {/* Nav. The mark plus the word, because at this size the mark alone is
          not yet a thing anybody recognises. */}
      <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-app-bg/80 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <span className="flex items-center gap-2 text-accent">
            <Mark className="h-7 w-7" />
            <span className="font-game text-lg font-bold tracking-[0.28em] text-white uppercase">
              Fitdle
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:block"
            >
              How it works
            </Link>
            <Link
              href="/play"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-app-bg transition-opacity hover:opacity-90"
            >
              Play
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ── hero ── */}
        <section className="relative overflow-hidden">
          {/* A single soft wash behind the fold. Pointer-events off so it can
              never sit between a reader and the button. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[32rem] bg-[radial-gradient(ellipse_at_top,var(--color-accent-dim),transparent_70%)] opacity-70"
          />
          <div className="relative mx-auto w-full max-w-6xl px-6 pt-16 pb-12 sm:pt-24">
            <div className="flex flex-col items-center text-center">
              <Lockup className="h-28 w-28 text-accent drop-shadow-[0_0_28px_var(--color-accent-dim)] sm:h-36 sm:w-36" />

              <h1 className="mt-8 max-w-4xl text-3xl leading-[1.1] font-bold text-balance text-white sm:text-6xl">
                Your muscles tell you what your letters cannot.
              </h1>

              <p className="mt-6 max-w-2xl text-base text-pretty text-slate-300 sm:text-lg">
                A daily exercise deduction game. {MAX_GUESSES} guesses, one hidden move, and an
                anatomical figure that reacts to every wrong answer.
              </p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                <Link
                  href="/play"
                  className="rounded-xl bg-accent px-7 py-3.5 text-base font-semibold text-app-bg transition-opacity hover:opacity-90"
                >
                  Play today&rsquo;s puzzle
                </Link>
                <Link
                  href="/play"
                  className="rounded-xl bg-white/[0.06] px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/[0.12]"
                >
                  Practice mode
                </Link>
              </div>

              <p className="mt-4 text-sm text-slate-400">
                Free. No account needed. A new exercise at midnight UTC.
              </p>
            </div>

            {/*
              * The product, immediately. The first version of this page
              * described a visual game entirely in prose, which asked the
              * reader to do work a screenshot does for free.
              *
              * Two crops rather than one responsive image: the desktop capture
              * shrunk to a phone is a picture of a layout, not a picture of a
              * game - the tiles become illegible and the anatomy panel is a
              * smudge. Neither is marked `priority`, because the LCP element
              * here is the headline, and preloading an image that the other
              * breakpoint hides would spend bandwidth on something nobody sees.
              */}
            <Shot
              src="/screens/app-full.png"
              alt="Fitdle mid-round: two scored guesses on a nine-letter grid, with the anatomy panel showing shared muscles in green and ruled-out muscles in red."
              width={1600}
              height={1000}
              className="mt-14 hidden sm:block"
            />
            <Shot
              src="/screens/mobile.png"
              alt="Fitdle on a phone: the anatomy figure above a nine-letter grid with two scored guesses."
              width={480}
              height={1039}
              className="mx-auto mt-10 max-w-[16rem] sm:hidden"
            />

            <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tile-border bg-tile-border sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-5 text-center">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block font-game text-2xl font-bold text-white tabular-nums">
                      {s.value}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── how it works ── */}
        <Section id="how" eyebrow="How it works" title="Two feedback channels. One hidden exercise.">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <ol className="flex flex-col gap-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-game text-sm font-bold text-accent tabular-nums">{s.n}</span>
                  <div>
                    <h3 className="text-base font-semibold text-white">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Shot
              src="/screens/board.png"
              alt="Two guessed rows on the board, with letters scored green, yellow and grey."
              width={900}
              height={658}
            />
          </div>
        </Section>

        {/* ── the differentiator ── */}
        <div className="border-y border-white/[0.07] bg-surface/30">
          <Section eyebrow="The difference" title="The muscle map is the whole idea.">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="flex flex-col gap-6">
                <p className="text-base leading-relaxed text-slate-300">
                  Letters alone make this a word game. The anatomy panel makes it a search. Every
                  guess lights up the figure, and what it rules out is worth as much as what it
                  confirms - so a wrong answer still narrows the body.
                </p>
                <ul className="flex flex-col gap-4">
                  {STATES.map((s) => (
                    <li key={s.label} className="flex items-start gap-3">
                      {/* The swatch repeats what the figure shows, and the label
                          repeats it in words - colour is never the only carrier. */}
                      <span
                        aria-hidden
                        className={`mt-1 h-4 w-4 shrink-0 rounded ${s.swatch}`}
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-white">{s.label}</h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <Shot
                src="/screens/muscle-map.png"
                alt="The anatomy panel, front and back, with legs lit green, shoulders and chest red, and a dashed amber ring over the hamstrings."
                width={720}
                height={846}
                className="mx-auto w-full max-w-sm"
              />
            </div>
          </Section>
        </div>

        {/* ── try it ── */}
        <Section eyebrow="Try it" title="Thirty seconds. No account, no puzzle spent.">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div className="flex flex-col gap-4">
              {/* The card beside this already states what the drill is and why
                  it helps, so this says the part the card cannot: it is real,
                  and it costs you nothing to try. */}
              <p className="text-base leading-relaxed text-slate-300">
                The muscle map with the word puzzle removed. An exercise appears, you tap the
                muscle it works, and thirty seconds later you find out how well you read a body.
              </p>
              <p className="text-base leading-relaxed text-slate-300">
                This one is live, not a picture. Nothing you do in it touches a streak or
                today&rsquo;s answer, and you do not need an account.
              </p>
            </div>
            {/*
              * A client island in an otherwise server-rendered page. The drill
              * was built to touch no puzzle state - no streak, no seed, no
              * server call - which is exactly what makes it safe to drop in
              * front of someone who has not started a round.
              */}
            {/* Capped, not full-width. The drill was built for a sidebar, and
                given a wide column the two figures float in the middle of it
                with the answer buttons stretched to arm's length either side. */}
            <div className="mx-auto w-full max-w-md rounded-xl border border-tile-border bg-surface p-5 sm:p-6">
              <AnatomyDrill />
            </div>
          </div>
        </Section>

        {/* ── do the exercise ── */}
        <Section eyebrow="After the round" title="You actually have to do it.">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="text-base leading-relaxed text-slate-300">
                Solving gives you a prescription, not a well-done screen. Sets and reps for the
                exercise you just worked out, how to perform it, and a link to watch it done
                properly. Anything needing a barbell, dumbbell, kettlebell or machine comes with a
                no-equipment substitute, so the answer is never something you cannot do.
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-300">
                There is also a form coach for the day&rsquo;s movement - and a hard rule that it
                sends anything involving pain to a physio rather than answering it.
              </p>
              <p className="mt-6 text-sm text-slate-400">
                Fitdle is a game. It is not a medical tool or a training prescription service.
              </p>
            </div>
            <div className="rounded-xl border border-tile-border bg-surface p-6">
              <Target className="h-6 w-6 text-accent" aria-hidden />
              <h3 className="mt-4 text-base font-semibold text-white">The opening call</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Before your first guess you may name the answer&rsquo;s muscle group. Right, and the
                equipment hint unlocks immediately. Wrong, and you forfeit the muscle group you
                would have been given at guess {CATEGORY_HINT_AT}.
              </p>
              <p className="mt-3 text-sm text-slate-400">Optional, and a genuine risk.</p>
            </div>
          </div>
        </Section>

        {/* ── everything else ── */}
        <div className="border-y border-white/[0.07] bg-surface/30">
          <Section eyebrow="Everything else" title="Beyond the daily puzzle.">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-tile-border bg-surface p-6">
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                  <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{body}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── close ── */}
        <Section eyebrow="Getting started" title="Free. Account optional.">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="flex flex-col gap-6">
              <p className="text-base leading-relaxed text-slate-300">
                The puzzle, practice mode and the anatomy drill need no account. Signing in adds the
                leaderboard and syncs your streak across devices. Nothing is behind a paywall.
              </p>
              <ul className="flex flex-col gap-4">
                <li className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <p className="text-sm leading-relaxed text-slate-300">
                    <span className="font-semibold text-white">One puzzle a day.</span> The same
                    exercise for everybody, resetting at midnight UTC.
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <p className="text-sm leading-relaxed text-slate-300">
                    <span className="font-semibold text-white">Installable.</span> Add it to your
                    home screen and it opens full screen, without browser chrome.
                  </p>
                </li>
              </ul>
              <div>
                <Link
                  href="/play"
                  className="inline-block rounded-xl bg-accent px-7 py-3.5 text-base font-semibold text-app-bg transition-opacity hover:opacity-90"
                >
                  Play today&rsquo;s puzzle
                </Link>
              </div>
            </div>
            <Shot
              src="/screens/mobile.png"
              alt="Fitdle on a phone, with the anatomy figure above the board and the keyboard below."
              width={480}
              height={1039}
              // The hero already shows this crop on small screens.
              className="mx-auto hidden max-w-[15rem] sm:block"
            />
          </div>
        </Section>
      </main>

      <footer className="border-t border-white/[0.07] bg-surface/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-slate-400">
            <Mark className="h-6 w-6" />
            <span className="font-game text-sm font-bold tracking-[0.28em] text-slate-300 uppercase">
              Fitdle
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <Link href="/play" className="transition-colors hover:text-white">
              Today&rsquo;s puzzle
            </Link>
            <Link href="#how" className="transition-colors hover:text-white">
              How it works
            </Link>
            <a
              href="https://github.com/TheRealArron/Fitdle"
              className="transition-colors hover:text-white"
            >
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
