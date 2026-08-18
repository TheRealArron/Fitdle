# Prompt: Fitdle landing page

Paste everything below the line into v0, Lovable, or a fresh Claude session.

---

Build a landing page for **Fitdle**, a daily exercise deduction game. It is a
real, finished product — everything described here already works. Your job is
the marketing page that sits in front of it.

## What the game actually is

Wordle's format applied to anatomy. Everyone gets the same hidden exercise name
each day and has 6 guesses, but there are **two feedback channels running at
once**:

1. **Letters**, scored like Wordle — green for right letter, right place;
   yellow for right letter, wrong place; grey for absent.
2. **Muscles**. An anatomical figure sits beside the board and reacts to every
   guess. Green means your guess and the answer both work that muscle. Dark red
   means your guess works it and the answer does not — ruled out. Unlit means
   untouched, so it tells you nothing.

That second channel is the whole idea and it should be the centrepiece of the
page. You are not brute-forcing letters, you are narrowing an anatomical search
space. A wrong guess still teaches you something about the human body.

Other real mechanics worth a mention:

- Answers are **5 to 9 letters and the grid width changes daily**, which is
  itself a clue before you have typed anything.
- **The opening call**: before your first guess you may name the answer's muscle
  group. Right, and the equipment hint unlocks immediately. Wrong, and you
  forfeit the muscle-group hint you would have got at guess 3. Genuinely
  optional, genuinely a risk.
- **You have to actually do it.** When the round ends you get a prescription for
  the exercise, with a no-equipment substitute for anything needing a barbell or
  dumbbell.
- **Anatomy drill** — a 30-second warm-up where you name the muscle an exercise
  works by tapping the figure. Has its own personal best.
- Streaks, a global leaderboard (longest streaks, and today's solve by fewest
  guesses), shareable emoji result grids, practice mode.
- 100 exercises, 62-day answer schedule, six guesses.

## Tone

Confident and plain. This is a puzzle for people who lift, written by someone
who cares whether the anatomy is right. Short sentences. Specific claims.

Explicitly avoid: hustle-culture language, "unlock your potential", "AI-powered"
as a headline, exclamation marks, and em-dashes.

## Hard constraints — do not violate these

- **Invent nothing.** No testimonials, no "trusted by 10,000 athletes", no press
  logos, no star ratings, no user counts, no founder quotes. The product has no
  users yet. A fabricated number is the fastest way to lose a technical reader.
- **No pricing section and no upgrade button.** There is no payment system. The
  game is entirely free. Do not imply a paid tier exists.
- **No external requests of any kind** — no CDN scripts, no Google Fonts link,
  no remote images, no analytics. A strict Content Security Policy blocks them
  and the page will silently break. Inline everything.
- Do not claim it is a medical or training tool. It is a game that happens to
  teach anatomy.

## Technical target

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, framer-motion,
lucide-react for icons. It will live at `src/app/landing/page.tsx` in an
existing codebase, so:

- Use only Tailwind utility classes and the CSS custom properties below. Do not
  add a `tailwind.config.js` (Tailwind 4 configures via `@theme` in CSS).
- Use `next/image` for images, not `<img>`.
- Any interactivity needs `'use client'`; keep as much as possible server-rendered.

### Brand tokens (already defined — reference them, do not redefine)

```
--color-app-bg:        #0a0e18   page background
--color-surface:       #101725   cards, rails
--color-surface-2:     #161f31   raised elements
--color-accent:        #34d399   primary green, the brand colour
--color-state-correct: #22c55e   "correct" green
--color-state-present: #eab308   "present" yellow
--color-state-absent:  #4b5563   "absent" grey
--color-state-excluded:#7f1d3a   "ruled out" red
--color-tile-border:   #23304a
```

Available as Tailwind classes: `bg-app-bg`, `bg-surface`, `bg-surface-2`,
`text-accent`, `bg-state-correct`, `bg-state-present`, and so on.

### Assets

- `/mark.png` — the logo figure, a **white silhouette in the alpha channel**.
  Render it as a CSS mask filled with `currentColor` so it takes the surrounding
  text colour. Do not use it as a plain `<img>`; the shape is alpha-only.
- `/logo.png` — the full lockup (figure above the FITDLE wordmark), same
  alpha-only treatment.

### Accessibility and theming

The app ships five themes including a light one, plus a colourblind mode, and a
build step fails on any text under 4.5:1 contrast or any meaningful non-text UI
under 3:1. So:

- Every colour pairing you choose must clear those ratios on the dark background.
- Never use colour as the only carrier of meaning — pair it with a label, shape
  or icon.
- Respect `prefers-reduced-motion`: gate every animation behind it.

## Structure

Aim for six sections, in this order. Keep total copy tight — nobody reads a
landing page, they skim it.

1. **Hero.** The logo mark, one headline, one sentence, one button reading
   "Play today's puzzle". Beside it, a live-looking mock of the board mid-round
   with the anatomical figure lit up in green and red. This visual is the single
   most important thing on the page.
2. **How it works.** Three steps, illustrated rather than described. Show an
   actual scored guess row and what it tells you.
3. **The muscle map.** The differentiator. Explain the three states with a real
   diagram, and make the point that a wrong guess still narrows the anatomy.
4. **The opening call.** The risk mechanic. Short — it rewards the reader for
   getting this far.
5. **Beyond the puzzle.** A compact grid: streaks and leaderboard, the anatomy
   drill, the prescription with home substitutions, practice mode, five themes,
   colourblind mode.
6. **Footer.** One call to action, and links.

Build the whole page. Prioritise the hero and the muscle-map section — if you
run out of room, those two are what matters.
