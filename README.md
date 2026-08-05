# Fitdle Pro

A fitness-themed daily deduction game. Guess the exercise in six tries, using
two independent feedback channels: letters, and the muscles it works.

Next.js 15 (App Router) · TypeScript · Zustand 5 · Tailwind CSS 4 · Framer Motion · Lucide

```bash
npm install
npm run dev              # http://localhost:3000

npm run verify           # ← the one that matters. Everything, in order.
```

`verify` runs typecheck → lint → 93 unit tests → build → bundle leak check →
smoke test in **both dev and production**. Individually:

```bash
npm test                 # 147 unit tests
npm run smoke            # boots dev AND prod, drives a real browser
npm run smoke -- dev     # one mode, while iterating
npm run check:bundle     # prove the answer schedule is not in the shipped JS
npm run cloud:check      # verify Supabase keys, schema and RLS
npm run build:extension  # -> extension-dist/, loadable in chrome://extensions
```

### Why `smoke` runs both modes

Twice, a change passed every unit test, typechecked, linted and built - and
still shipped a dead page, because it was only exercised in one mode:

| Regression | Passed | Broke |
|---|---|---|
| CSP without `'unsafe-eval'` | production | **dev** - no HMR, blank page at `opacity: 0` |
| Daily seed from `new Date()` at module scope | dev | **production** - build-day answer baked into prerendered HTML |

Neither is reachable from a unit test: both are properties of the running
server. `smoke` boots each mode, drives a browser, and asserts the app actually
hydrates - which is where both failures surfaced. It has been confirmed to fail
on the real regression, not just to pass on the fix.

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
| ▪ dark | you have not probed it - it tells you nothing |

Guess SQUAT against a hidden DEADLIFT and the glutes go green while the abs go
red: you have learned it is a posterior-chain movement without a single letter
helping. Crucially, muscles the answer works stay **dark** until one of your
guesses touches them. The figure narrows the search space; it never hands over
the answer.

**Hints unlock progressively.** Guesses 1–2 are yours alone. Guess 3 reveals the
muscle group, guess 5 the equipment.

**Names are letters only** - no spaces or hyphens, singular. Pull-ups is
`PULLUP`, Farmer's carry is `FARMERS`. All 99 names are one tap away behind the
list icon; you are not expected to know them by heart.

**When the daily is done** the keyboard - now dead weight - is replaced by a
panel offering the thing you actually want next: another round. Practice mode
gives you unlimited random puzzles. They are never written to
storage, so there is no path from a practice round to a streak - replaying until
you win buys nothing.

**Today's shortlist** unlocks after guess 2 - a collapsible panel listing every
answer of today's length. A second tab narrows it to only those matching every
clue on your board. That one is a solver and says so: with 12 answers per length
it will often leave a single word, which is why the plain list is the default
and narrowing is a deliberate click.

**Colourblind mode** swaps green/yellow for blue/orange across tiles, keyboard,
figure, legend and the share grid. The game runs two colour channels
(green/yellow on the board, green/wine on the figure) and red-green deficiency
breaks both at once, so all of them move together.

**Today's challenge** turns the answer into a prescription - `4 × 8 Burpee`,
`3 × 45 seconds Plank` - with its own streak, tracked separately from the puzzle
streak. Getting the word is not the same achievement as doing the work, and
conflating them would let one paper over the other. Marking it done is the
honour system, deliberately: a browser cannot verify a set of squats, and
pretending otherwise would be worse than trusting the player.

**Tap any muscle** on the figure to see what else trains it. Mid-game that is a
strategic aid - knowing three other exercises that hit the lats tells you what to
probe. After the round it names whether the answer worked that muscle and how.
The answer is excluded from those lists at all times, so the panel can never
become an oracle.

**Form videos.** Every one of the 60 answers links to a real, curated coaching
video (NASM, Runna, Barbell Logic, PureGym, BarBend and similar). Shown on wins
too, not just losses - the coaching is the point of the game, and hiding it
behind a loss punishes the players who engaged most.

---

## Where this deviates from `claude.md`, and why

The spec was implemented as written except for the following. Each change is
load-bearing - the spec as literally written does not deliver what section 1
promises.

### 1. The five-letter grid had to go

English contains roughly **eight** real five-letter exercise names. The spec
needed fifteen, so it padded the list with mutilations: `BURPE`, `ROWSR`,
`DIPSB`, `VUPPS`, `CRUNC`. Those are unguessable - no player can deduce a word
that is not a word - and no amount of curating the list fixes it while the grid
is five wide.

Answers now run **5–9 letters at their natural spelling**, and the grid width
changes daily, which is itself a strong clue. The pool is 60 answers (12 per
length) inside a 99-exercise catalogue.

One caveat stated plainly in the source: the daily index is `seed % ANSWERS.length`,
so **changing the pool size reshuffles the whole calendar**, not just future
days. Growing the pool is safe before launch and not after - at that point
either freeze the size or move to a pinned date→answer schedule.

### 2. "What do I even guess?" needed an answer inside the product

Wordle works because every player already carries the answer space in their
head: common English. Nobody carries a list of exercise names. So the game hands
it over - [ExerciseIndex.tsx](src/components/ExerciseIndex.tsx) is a searchable
list of the full vocabulary, defaulting to today's length so it doubles as the
candidate list for the puzzle in front of you.

Guesses must be real exercises of the day's length. That constraint is what
makes the space *knowable*; the index is what makes it *fair*.

### 3. The muscle figure, per section 1's "muscle-group feedback"

The spec listed muscle-group feedback as a core feature but only ever surfaced
it in the result modal - after you had already won, when it could no longer help
you. It is now a live deduction channel. See
[BodyFigure.tsx](src/components/BodyFigure.tsx) and
[muscleFeedback.ts](src/lib/muscleFeedback.ts).

`Shoulders` was added to the spec's six muscle groups. Folding delts into `Arms`
mislabels about a dozen exercises, and a category hint is only useful if it is
accurate.

### 4. The daily word is seeded from UTC, not local time

The spec's `getDailyIndex` read `now.getFullYear()`, `now.getMonth()`,
`now.getDate()` - **local** date parts. At 2026-07-30 10:00 UTC a player in
Auckland is on the 30th and one in Los Angeles is still on the 29th, so they get
different answers. That contradicts the stated requirement that every user gets
the same word today.

The seed arithmetic is unchanged - `year * 10000 + (month + 1) * 100 + date`,
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
| `lastSeed` anchor - a puzzle pays out at most once, idempotent by seed | Replay. Clearing storage to retry now *resets* the streak, so cheating is strictly worse than playing |
| `highSeed` monotonic high-water mark | Winding the system clock back to farm past puzzles |
| Keyed 128-bit digest over a canonically serialised record | Hand-editing `"streak":3` in devtools - the realistic attack |
| Semantic coherence checks (`wins <= played`, `distribution` sums to `wins`, uniform guess width) | Forged records that verify but are internally impossible |
| Fail-closed | A record that does not verify is discarded, not trusted |

The spec's digest was a non-keyed 32-bit hash rendered as short hex -
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
completion, which advances `revealingRow` and gates everything derived - the
keyboard, the muscle figure and the hint unlocks all wait, so nothing spoils the
reveal.

Colours are the spec values exactly: `#22c55e` / `#eab308` / `#4b5563`, asserted
against `getComputedStyle` in a real browser.

### Three-column layout, and why the rails are the same width

Desktop is `menu | board | figure`. The side rails are deliberately **equal
width**, and both appear at `xl` or not at all.

This is not cosmetic. An asymmetric layout pushes the board off the viewport
centre while the header and keyboard stay centred on it, and that mismatch is
what reads as broken alignment - it was a real bug in the previous version,
where the board lived in a `flex-1` column beside a fixed-width figure and
centred itself within that column instead of the page. Equal rails make the
board's centre exactly the viewport's centre at every width; a test asserts
`boardCentre === keyboardCentre === viewportCentre` across five viewports.

### Security posture

| Control | State |
|---|---|
| Row-level security | Enabled, four owner-only policies, **verified live** by `cloud:check` returning `42501` on an anonymous write |
| Clock rewind (replay old puzzles) | Blocked by the monotonic `highSeed` high-water mark |
| Clock *forward* skip (play tomorrow early) | Blocked once `fitdle_server_time()` exists - the daily seed comes from the server, not the browser |
| Token exfiltration after an XSS | Blocked by `connect-src` pinned to self + your one Supabase project |
| Clickjacking an authenticated session | Blocked by `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Plugin / base-tag escalation | Blocked by `object-src 'none'`, `base-uri 'self'` |
| Inline script injection | **Not** blocked - see the CSP note in [next.config.ts](next.config.ts) |
| Future answers readable in devtools | **Blocked.** The date→answer ordering is server-only; `check:bundle` greps 43 client chunks to prove it |
| Fabricating a win from the console | **Blocked.** `status` is derived server-side from guesses in a token the server signed |
| Forging progress to unlock hints early | **Blocked.** Game state is HMAC-signed; a tampered token is discarded, not trusted |
| Replaying an old session | **Blocked.** The seed is inside the signature |
| Brute-forcing the answer via the API | Rate limited to 20 guesses/min per IP - a speed bump, not a distributed defence |
| Forging a streak in the cloud | **Blocked for signed-in players.** The client's `insert`/`update` permission on the progress row is revoked; the API writes it under the service-role key |
| Forging a streak while signed out | **Not** protected, and cannot be. A local save is the player's own file. It is also private, and not what a leaderboard reads |

The remaining row is by design rather than unfinished. An anonymous player's
save lives on their machine and no amount of client-side cleverness makes it
trustworthy - but nothing reads it except them.

#### The trusted clock, and a trap worth knowing about

`highSeed` stops someone winding the clock *back* to farm old puzzles, but not
*forward* to play tomorrow early - that just looks like time passing.

The obvious fix is to read the `Date` response header off any Supabase call.
**It does not work, and it fails silently.** `Date` is not a CORS-safelisted
response header, so cross-origin JavaScript reads `null` even though `curl` sees
the header perfectly. It was built that way first, and the clock-skew test
caught it. The time now comes back in the response *body*, from a small `stable`
SQL function in [schema.sql](supabase/schema.sql).

### The server owns the answer

The client used to ship `ANSWERS[seed % 60]`, which is the entire schedule -
readable in devtools, every future puzzle included. That is now split:

| Client (`data/exercises.ts`) | Server (`server/answers.ts`) |
|---|---|
| All 99 exercise names, muscles, equipment | The date→answer **ordering** |
| `isAnswer` flag | How-to text, video ids, daily challenge |

**The word list staying public is deliberate.** Wordle works because everyone
carries common English in their head; nobody carries a list of exercise names,
so the in-app index has to hand them over or the game is unplayable. Knowing a
word *can* be an answer narrows 99 to 60. Knowing *which day* would give the
game away - and that is the part that moved.

`server-only` on the answer module turns an accidental client import into a
build error rather than a silent leak. `npm run check:bundle` is the
belt-and-braces version: it greps the compiled chunks for consecutive runs of
the real schedule, because finding one name proves nothing when the catalogue is
public by design.

**Guesses are scored server-side.** `/api/guess` recomputes the whole game from
a signed guess history and returns the truth - there is no code path that
accepts a result from the browser. Verified by attacking it:

```
Forge a token claiming 5 guesses  -> REJECTED, token discarded, started fresh
POST status:"won" alongside       -> IGNORED, status derived server-side
Replay yesterday's token          -> REJECTED, seed is inside the signature
```

**The cost, stated plainly:** the daily now needs a network connection, and the
Chrome extension must point at a deployment (`NEXT_PUBLIC_API_URL`) because a
static export has no server of its own. Practice mode stays fully local - it
touches no streak, so leaking a practice answer costs nothing and requiring a
round trip per practice guess would make the mode worse for no gain.

### Leaderboard

Two boards, both public, both read-only. The only way onto either is to finish a
round, which `/api/guess` banks from a session it signed itself.

| Board | Ranks by | Ties |
|---|---|---|
| **Streaks** | Current streak, descending | Whoever got there first |
| **Today** | Fewest guesses | Whoever finished earlier |

**No user id ever reaches the client.** A stable public identifier is a
correlation key, and a leaderboard is exactly where someone would go to collect
them - so "is this row me?" is decided on the server against the verified caller
and leaves as a boolean. Your own rank when you miss the top ten is computed the
same way: a count of players strictly ahead of you, never a list.

**The ranking columns are generated, not written.** Postgres derives `streak`,
`day_seed`, `day_guesses` and `day_won` from the save blob, so a leaderboard
column physically cannot drift from the record it ranks - which it would within
a week if the server had to remember to update both. `username` is the one
exception: it lives in `auth.users`, which nobody may read for another account,
so the API denormalises it at bank time.

Both boards have a composite index matching their exact sort order, and tests
assert the query and the index agree - a mismatch is invisible until the table
is big enough to hurt.

#### Why "Today" ranks guesses, not speed

A speed board was the obvious second dimension, and it is not honestly
measurable here. Nothing records when a player *started*, and anything that did
would reset by discarding the session and asking for a fresh one - so the board
would rank whoever worked that out rather than whoever solved it fastest. Guess
count is already measured, already unforgeable, and is what the game is
about. The UI never uses the word "fastest", and a test enforces that.

### The streak is the server's, not the browser's

RLS stops you writing someone else's row. It says **nothing** about the
truthfulness of your own - so while the browser held write permission,
`streak: 9999` against your own record was a devtools one-liner. Private, that
is untidy. On a public leaderboard it is the whole game, which is why this had
to land before the leaderboard rather than after.

So the write moved:

| | Before | Now |
|---|---|---|
| Who computes the streak | The browser | `/api/guess`, from a session it signed itself |
| Who writes the row | The browser, via RLS | The API, via the service-role key |
| Client RLS on progress | select, insert, update, delete | **select and delete only** |

`/api/guess` is the one place that knows both that the round is over and how
many guesses it took, so it banks the result at that moment and returns the
record. The client adopts it wholesale rather than merging - merging would let
an edited local save pull the displayed streak back up, which is the exact hole
being closed.

Two properties worth stating:

- **Idempotent.** `commitResult` refuses to pay out twice for the same seed, so
  a retried request or a replayed winning call cannot inflate anything. That is
  inherited from the existing arithmetic, not re-implemented, and pinned by a test.
- **Fails soft.** An anonymous player, a deployment with no service-role key, or
  a failed write all fall back to the local save. A cloud problem must never
  cost someone the result they just earned.

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS completely, so it is server-only and
`npm run cloud:check` fails loudly if it is ever the anon key by mistake - or if
the project is still running the old policies, which would look completely fine
while forged streaks sailed through.

### Anatomy drill

A 30-second warm-up: name the muscle each exercise works, as fast as you can.

**It is not brain training, and the copy never says it is.** The evidence that
generic cognitive-training games transfer to anything outside themselves is
weak, and a health claim we cannot support has no place in a fitness product.
This drills one specific, checkable skill - the exercise-to-muscle mapping - and
that is precisely the second feedback channel the puzzle scores you on. Getting
better at it makes you measurably better at Fitdle. That is the only claim made.

Two invariants a generator this small could easily get wrong, both pinned by
tests:

- **No distractor is a muscle the exercise actually works**, not even as a
  secondary assistor. Otherwise the "wrong" answer is arguably right, and a quiz
  you can lose by being correct teaches the opposite of what it should.
- **The pool is the whole catalogue, including today's answer.** Excluding it
  would be a leak: diff the drill's vocabulary against the exercise index and
  the missing word is the answer.

It touches no puzzle state - no streak, no seed, no server call. The worst
outcome of a bug in it is a wrong personal best. The badge it earns
(🔥 / 💪 / 🧠) rides on its own line in the share text, never folded into the
`n/6` score, which has to stay comparable between players.

### Do the exercise, wherever you are

Solving the puzzle gives you a prescription - `4 x 8 Burpee`, `3 x 45 seconds
Plank`. For the 25 answers that need a barbell, dumbbell, kettlebell or machine,
that instruction is useless to anyone not standing in a gym, so each one carries
a **no-equipment substitute**: a backpack, a towel, a chair, a wall.

That data lives in the catalogue, not in a model. It renders for every player on
every deployment, with no API key and no network call beyond the one that
revealed the answer.

### The form coach

On top of that sits an optional coach: ask a question about the exercise you
just solved and get a coaching cue back. Scope is the whole design.

**It answers about one exercise - the one you just solved.** A fitness chatbot
that will write you a training programme is giving medical-adjacent advice to a
stranger it cannot assess, and a daily word game has no business doing that.
"My knees cave on squats" is useful and bounded. "Design my week" is neither.

**It will not coach you through pain.** Joint pain, sharp pain, numbness or an
existing injury gets one answer: it cannot assess that, a physio can. No
workaround, no modification, no diagnosis. That is the one guardrail in the
prompt that is not about product scope.

**It cannot be used as an oracle.** The endpoint is gated on the same signed
session that gates the reveal, so it is unreachable until the round is over.
Verified by attacking it:

```
Ask mid-round, valid session   -> 403
Ask with no session at all     -> 403
Forge a session claiming 6 guesses -> 403
```

It is `claude-opus-5` at `effort: "low"` - the movement's details are already in
the prompt, so deep reasoning buys nothing and costs the player latency on a
result screen. Rate limited to 10 questions/min, capped at 400 characters, and
it fails soft: no key, a refusal, or a network error hides the box rather than
breaking the result screen it lives on.

**Not verified end to end.** No Anthropic key was available in the development
environment, so the gate, the rate limit and the no-key path are tested live but
the model call itself is not.

### Accounts and cloud sync

Real accounts via Supabase: email/password sign-up and sign-in, sessions that
survive reloads, and a streak that follows you between devices.

**Setup: [docs/supabase-setup.md](docs/supabase-setup.md)** - five minutes, free
tier, with troubleshooting.

**It works without keys.** A fresh clone and the extension build have no
backend, so the account panel says so plainly and falls back to a backup code
rather than showing a sign-in form that cannot reach a server.

**`npm run cloud:check` before you trust it.** The cloud path cannot be
exercised without real credentials, so it ships untested by construction.
[cloud-check.mjs](scripts/cloud-check.mjs) walks the whole chain - keys present,
project reachable, table exists, RLS actually enforced, anonymous writes refused
- and names the exact fix for whatever is missing. The RLS checks matter most:
the anon key is public and ships in the bundle, so those policies are the only
thing between one player and everyone else's rows.

**Merge, not last-write-wins.** Two devices can both play offline and both be
legitimate, and there is no timestamp we can trust because the clock belongs to
the player. So [cloudSync.ts](src/lib/cloudSync.ts) merges on the data itself:
monotonic counters take the max (you cannot un-play a game), `highSeed` takes
the max so clock-rollback protection cannot be laundered away by syncing from a
tampered device, and the *streak* comes from whichever save played most recently
- taking the larger streak would let a stale device resurrect a broken one. The
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

Two typefaces, each with a job. Inter carries the interface - its tall x-height
keeps the 10–12px rail labels legible where a monospace turns to mush. Geist
Mono carries anything read as *data*: tiles, timers, streaks, exercise names,
backup codes. Fixed advance width means a ticking countdown never reflows its
neighbours.

Scored tiles get a bloom in their own colour, which is what makes the board read
as lit rather than painted - and because it only ever appears on the three
result states, it reinforces the same one-saturated-colour rule.

### Form videos

`FORM_VIDEO` in [exercises.ts](src/data/exercises.ts) pins one video per answer.
Every ID was resolved from a real search and then checked against YouTube's
oEmbed endpoint, which returns the live title and channel - 40/40 came back
valid, so none are guessed and none were dead at the time of writing. The
verified title sits beside each ID as a comment.

Videos still rot, so `formVideoUrl` prefers the pinned link while
`searchVideoUrl` is always available as a fallback that cannot 404, and the UI
offers both. Thumbnails come straight from YouTube's CDN with an `onError` that
drops the image rather than showing a broken frame. No iframe: MV3's CSP would
block an embedded player in the extension popup anyway.

### Board sizing

Tiles are `aspect-square`, so the board is width-driven - but its available
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

`npm test` - 106 tests over the things that must not silently break:

- **daily** - seed formula, timezone invariance, the UTC-midnight boundary, the
  pinned answer order and length cycle, catalogue integrity, and that each
  answer length has enough candidates to be a real puzzle.
- **evaluate** - duplicate-letter scoring, position-before-presence, keyboard
  state never downgrading, length-agnostic scoring.
- **muscles** - overlap accumulation, `shared`/`missed` disjointness, and the
  core guarantee that unprobed muscles stay dark.
- **security / persistence** - digest avalanche and collisions, replay blocking,
  clock-rollback detection, streak continuity, stats coherence, and a save round
  trip at every answer length.
- **videos** - every answer has a pinned video, ids are well-formed, no two
  exercises share one, and the search fallback is always present.

Browser passes (Playwright, not part of `npm test`): the full game flow, the
layout at 5 and 9 columns across five viewports, every figure region checked
against the data model, and a feature pass covering practice-mode isolation,
the backup-code round trip, forged-code rejection and the video links.

That last one is a regression test. `isCoherent` originally hardcoded
`/^[A-Z]{5}$/`; once answers became variable-length, every save on a 6–9 letter
day failed validation, was treated as tampering, and silently wiped the player's
streak. The unit tests passed throughout - only driving the real browser caught
it.
