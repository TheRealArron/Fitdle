# Fitdle Pro

A fitness-themed daily deduction game. Guess the exercise in six tries, using
two independent feedback channels: letters, and the muscles it works.

Next.js 15 (App Router) · TypeScript · Zustand 5 · Tailwind CSS 4 · Framer Motion · Lucide

```bash
npm install
npm run dev              # http://localhost:3000
npm test                 # 75 unit tests
npm run typecheck
npm run lint
npm run build            # web build
npm run build:extension  # -> extension-dist/, loadable in chrome://extensions
```

---

## The game

Each day everyone gets the same exercise. You have six guesses.

**Letters** score like Wordle: green in place, yellow present elsewhere, grey absent.

**Muscles** are the second channel. An anatomy figure sits beside the board and
reacts to every guess:

| | |
|---|---|
| 🟩 green | your guess and the answer both work this muscle |
| 🟥 red | your guess works it, the answer does not |
| ▪ dark | you have not probed it — it tells you nothing |

Guess SQUAT against a hidden DEADLIFT and the glutes go green while the abs go
red: you have learned it is a posterior-chain movement without a single letter
helping. Crucially, muscles the answer works stay **dark** until one of your
guesses touches them. The figure narrows the search space; it never hands over
the answer.

**Hints unlock progressively.** Guesses 1–2 are yours alone. Guess 3 reveals the
muscle group, guess 5 the equipment.

**Names are letters only** — no spaces or hyphens, singular. Pull-ups is
`PULLUP`, Farmer's carry is `FARMERS`. All 99 names are one tap away behind the
list icon; you are not expected to know them by heart.

**When the daily is done** the keyboard — now dead weight — is replaced by a
panel offering the thing you actually want next: another round. Practice mode
gives you unlimited random puzzles. They are never written to
storage, so there is no path from a practice round to a streak — replaying until
you win buys nothing.

**Form videos.** Every one of the 60 answers links to a real, curated coaching
video (NASM, Runna, Barbell Logic, PureGym, BarBend and similar). Shown on wins
too, not just losses — the coaching is the point of the game, and hiding it
behind a loss punishes the players who engaged most.

---

## Where this deviates from `claude.md`, and why

The spec was implemented as written except for the following. Each change is
load-bearing — the spec as literally written does not deliver what section 1
promises.

### 1. The five-letter grid had to go

English contains roughly **eight** real five-letter exercise names. The spec
needed fifteen, so it padded the list with mutilations: `BURPE`, `ROWSR`,
`DIPSB`, `VUPPS`, `CRUNC`. Those are unguessable — no player can deduce a word
that is not a word — and no amount of curating the list fixes it while the grid
is five wide.

Answers now run **5–9 letters at their natural spelling**, and the grid width
changes daily, which is itself a strong clue. The pool is 60 answers (12 per
length) inside a 99-exercise catalogue.

One caveat stated plainly in the source: the daily index is `seed % ANSWERS.length`,
so **changing the pool size reshuffles the whole calendar**, not just future
days. Growing the pool is safe before launch and not after — at that point
either freeze the size or move to a pinned date→answer schedule.

### 2. "What do I even guess?" needed an answer inside the product

Wordle works because every player already carries the answer space in their
head: common English. Nobody carries a list of exercise names. So the game hands
it over — [ExerciseIndex.tsx](src/components/ExerciseIndex.tsx) is a searchable
list of the full vocabulary, defaulting to today's length so it doubles as the
candidate list for the puzzle in front of you.

Guesses must be real exercises of the day's length. That constraint is what
makes the space *knowable*; the index is what makes it *fair*.

### 3. The muscle figure, per section 1's "muscle-group feedback"

The spec listed muscle-group feedback as a core feature but only ever surfaced
it in the result modal — after you had already won, when it could no longer help
you. It is now a live deduction channel. See
[BodyFigure.tsx](src/components/BodyFigure.tsx) and
[muscleFeedback.ts](src/lib/muscleFeedback.ts).

`Shoulders` was added to the spec's six muscle groups. Folding delts into `Arms`
mislabels about a dozen exercises, and a category hint is only useful if it is
accurate.

### 4. The daily word is seeded from UTC, not local time

The spec's `getDailyIndex` read `now.getFullYear()`, `now.getMonth()`,
`now.getDate()` — **local** date parts. At 2026-07-30 10:00 UTC a player in
Auckland is on the 30th and one in Los Angeles is still on the 29th, so they get
different answers. That contradicts the stated requirement that every user gets
the same word today.

The seed arithmetic is unchanged — `year * 10000 + (month + 1) * 100 + date`,
then `% ANSWERS.length`. Only the getters became `getUTC*`. See
[daily.ts](src/lib/daily.ts).

A preserved property: `YYYYMMDD` is not contiguous, so the index jumps at month
boundaries (20260131 → 20260201 advances the seed by 70, not 1). That is what
the spec specifies.

**`ANSWERS` order is protocol.** Reordering or inserting rewrites every past and
future puzzle. The order cycles 5,6,7,8,9 letters so consecutive days differ in
grid width. A test pins both.

### 5. "Checksum-verified LocalStorage" cannot prevent tampering, so the real defence is anti-replay

The digest ships inside the JS bundle. Anyone can read it and forge a valid
record. No client-only scheme fixes this; only a server that owns the streak
does. [secureStorage.ts](src/lib/secureStorage.ts) says so at the top of the
file rather than implying a guarantee it cannot make.

What the spec's store allowed, independent of any hashing:

```
initGame()      -> resets guesses and status, keeps streak
submitGuess()   -> streak++ on a win
```

Win, refresh, win again. The streak inflates without touching devtools, and the
checksum is irrelevant because the app writes the forged value itself.

The fixes, in descending order of what they're worth:

| Defence | Attack it stops |
|---|---|
| `lastSeed` anchor — a puzzle pays out at most once, idempotent by seed | Replay. Clearing storage to retry now *resets* the streak, so cheating is strictly worse than playing |
| `highSeed` monotonic high-water mark | Winding the system clock back to farm past puzzles |
| Keyed 128-bit digest over a canonically serialised record | Hand-editing `"streak":3` in devtools — the realistic attack |
| Semantic coherence checks (`wins <= played`, `distribution` sums to `wins`, uniform guess width) | Forged records that verify but are internally impossible |
| Fail-closed | A record that does not verify is discarded, not trusted |

The spec's digest was a non-keyed 32-bit hash rendered as short hex —
reproducible in a one-line console expression and collision-prone. The
replacement runs four FNV-1a-style lanes with distinct primes and cross-lane
diffusion. Obfuscation with a real avalanche property, not cryptography.

### 6. Streak continuity, which the spec never implemented

The spec had no notion of *when* a streak was earned, so it never broke from
missed days. `reconcile()` resets it when the gap since `lastSeed` exceeds one
day, restores an in-progress board on reload, and keeps a finished day finished.

### 7. Scoring rules the spec left undefined

The spec never said how repeated letters score. Implemented as standard Wordle
two-pass: exact matches claim their letters first, then `present` is handed out
only while the answer's remaining budget allows. `SPSSS` against `PRESS` lights
one S, not four. See [evaluate.ts](src/lib/evaluate.ts).

### 8. The extension section produces a broken popup as written

Section 7 says to build with `output: 'export'` and wrap `out/` with the
manifest. That does not run. Manifest V3 enforces `script-src 'self'` on
extension pages and forbids `'unsafe-inline'`, but Next's exported HTML carries
inline bootstrap scripts (`self.__next_f.push(...)`). Chrome blocks them
silently and the popup renders an empty shell.

[build-extension.mjs](scripts/build-extension.mjs) post-processes the export:
hoists every inline script into an external file, rewrites `/_next/` to relative
paths, and renames `_next` → `next-assets` (Chrome refuses to serve resources
from underscore-prefixed directories). Verified output: 0 inline scripts, 0
`_next` references.

---

## Implementation notes

### Tile flip

[Tile.tsx](src/components/Tile.tsx) uses a genuine 3D rotation over two stacked
faces rather than a colour swap timed to a keyframe midpoint. The back face is
pre-rotated 180°, `backface-visibility` hides whichever side points away, and
the parent rotates `rotateX: 0 → 180`. No timers, so the animation cannot drift
out of sync with the state driving it.

Stagger is `index * 0.1s` per the spec. Only the last tile in a row reports
completion, which advances `revealingRow` and gates everything derived — the
keyboard, the muscle figure and the hint unlocks all wait, so nothing spoils the
reveal.

Colours are the spec values exactly: `#22c55e` / `#eab308` / `#4b5563`, asserted
against `getComputedStyle` in a real browser.

### Three-column layout, and why the rails are the same width

Desktop is `menu | board | figure`. The side rails are deliberately **equal
width**, and both appear at `xl` or not at all.

This is not cosmetic. An asymmetric layout pushes the board off the viewport
centre while the header and keyboard stay centred on it, and that mismatch is
what reads as broken alignment — it was a real bug in the previous version,
where the board lived in a `flex-1` column beside a fixed-width figure and
centred itself within that column instead of the page. Equal rails make the
board's centre exactly the viewport's centre at every width; a test asserts
`boardCentre === keyboardCentre === viewportCentre` across five viewports.

### Accounts and cloud sync

Real accounts via Supabase: email/password sign-up and sign-in, sessions that
survive reloads, and a streak that follows you between devices.

**It works without keys.** A fresh clone and the extension build have no
backend, so the account panel says so plainly and falls back to a backup code
rather than showing a sign-in form that cannot reach a server. Add a project URL
and anon key to `.env.local` (see [.env.example](.env.example)) and run
[supabase/schema.sql](supabase/schema.sql) to turn it on.

**Merge, not last-write-wins.** Two devices can both play offline and both be
legitimate, and there is no timestamp we can trust because the clock belongs to
the player. So [cloudSync.ts](src/lib/cloudSync.ts) merges on the data itself:
monotonic counters take the max (you cannot un-play a game), `highSeed` takes
the max so clock-rollback protection cannot be laundered away by syncing from a
tampered device, and the *streak* comes from whichever save played most recently
— taking the larger streak would let a stale device resurrect a broken one. The
merge is order-independent and its result always satisfies the same coherence
invariants `isCoherent` enforces, so a sync can never produce a save that the
next load rejects.

The schema is honest about its limit too: the client computes its own streak, so
a determined user can upload any number. Making streaks authoritative means
moving the answer and the scoring server-side, which is a product decision, not
a policy tweak.

### Design

One rule drives the palette: **the three tile states are the only saturated
colours in the product**. Every surface, border and label is a cool neutral ramp
on a single hue, so nothing competes with the board and the muscle figure.
Borders are white at low alpha rather than another grey, which means one value
sits correctly on every surface in the ramp.

Two typefaces, each with a job. Inter carries the interface — its tall x-height
keeps the 10–12px rail labels legible where a monospace turns to mush. Geist
Mono carries anything read as *data*: tiles, timers, streaks, exercise names,
backup codes. Fixed advance width means a ticking countdown never reflows its
neighbours.

Scored tiles get a bloom in their own colour, which is what makes the board read
as lit rather than painted — and because it only ever appears on the three
result states, it reinforces the same one-saturated-colour rule.

### Form videos

`FORM_VIDEO` in [exercises.ts](src/data/exercises.ts) pins one video per answer.
Every ID was resolved from a real search and then checked against YouTube's
oEmbed endpoint, which returns the live title and channel — 40/40 came back
valid, so none are guessed and none were dead at the time of writing. The
verified title sits beside each ID as a comment.

Videos still rot, so `formVideoUrl` prefers the pinned link while
`searchVideoUrl` is always available as a fallback that cannot 404, and the UI
offers both. Thumbnails come straight from YouTube's CDN with an `onError` that
drops the image rather than showing a broken frame. No iframe: MV3's CSP would
block an embedded player in the extension popup anyway.

### Board sizing

Tiles are `aspect-square`, so the board is width-driven — but its available
space is height-constrained and the column count changes daily. The board area
is a CSS **size container**, letting it compute its own width from the height it
actually has:

```css
width: min(100cqw, calc(100cqh * columns / 6))
```

No JS measurement, no per-breakpoint magic numbers. Verified at 5 and 9 columns
across phone (430×850), extension popup (380×600) and desktop (1280×860): tiles
stay 31–83px with no clipping and no horizontal overflow.

### Zustand v5 selectors

`selectKeyStates` and `selectHints` build fresh objects per call, and Zustand v5
compares snapshots by reference. Both **must** be wrapped in `useShallow`, or
React re-renders until it throws "Maximum update depth exceeded". Selectors
returning `Set`s (the muscle feedback) cannot be shallow-compared at all and are
derived with `useMemo` in the component instead.

## Tests

`npm test` — 75 tests over the things that must not silently break:

- **daily** — seed formula, timezone invariance, the UTC-midnight boundary, the
  pinned answer order and length cycle, catalogue integrity, and that each
  answer length has enough candidates to be a real puzzle.
- **evaluate** — duplicate-letter scoring, position-before-presence, keyboard
  state never downgrading, length-agnostic scoring.
- **muscles** — overlap accumulation, `shared`/`missed` disjointness, and the
  core guarantee that unprobed muscles stay dark.
- **security / persistence** — digest avalanche and collisions, replay blocking,
  clock-rollback detection, streak continuity, stats coherence, and a save round
  trip at every answer length.
- **videos** — every answer has a pinned video, ids are well-formed, no two
  exercises share one, and the search fallback is always present.

Browser passes (Playwright, not part of `npm test`): the full game flow, the
layout at 5 and 9 columns across five viewports, every figure region checked
against the data model, and a feature pass covering practice-mode isolation,
the backup-code round trip, forged-code rejection and the video links.

That last one is a regression test. `isCoherent` originally hardcoded
`/^[A-Z]{5}$/`; once answers became variable-length, every save on a 6–9 letter
day failed validation, was treated as tampering, and silently wiped the player's
streak. The unit tests passed throughout — only driving the real browser caught
it.
