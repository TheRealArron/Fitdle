# Decision log

Six decisions where the interesting part is the trade-off, not the code. Every
number here was measured in this repo and can be reproduced with the command
given. Where something was **not** measured, it says so — a decision log whose
figures fall apart under a follow-up question is worth less than no log at all.

---

## 1. The streak belongs to the server

**Problem.** Row Level Security stops you writing someone else's row. It says
nothing about the truthfulness of your own. While the browser held write
permission on its progress row, `supabase.from('fitdle_progress').update({ save:
{ streak: 9999 } })` in the console was a valid, authorised write. Private, that
is untidy; on a public leaderboard it is the whole game.

**Choice.** `insert` and `update` revoked from the client. `/api/guess` — the
only party that knows, from a session it signed itself, that a round ended and
in how many guesses — writes the row under the service-role key. The client
adopts the returned record wholesale rather than merging it, because merging
would let an edited local save pull the displayed streak back up.

The server runs the *same* `reconcile`/`commitResult` the client does, imported
rather than reimplemented. A second copy of streak rules drifts, and then the two
disagree about who is right. It also makes banking idempotent for free:
`commitResult` refuses to pay out twice for one seed.

**Measured.** Three attacks against the live API:

```
forge a token claiming 5 guesses  -> rejected, discarded, started fresh
POST status:"won" alongside       -> ignored, status derived server-side
replay yesterday's token          -> rejected, the seed is inside the signature
```

**Cost.** Every guess was already a round trip after the answer moved
server-side; banking adds one database write to the final guess of a round. The
latency was never measured — no production deployment exists.

**Not verified.** The RLS change itself. It needs a live project with the new
schema applied, which is an operator step. `npm run cloud:check` probes for it
and fails loudly if the old policies are still in place, because a project
running the old schema looks completely fine while forged streaks sail through.

---

## 2. The payload war

**Problem.** `@supabase/supabase-js` sat in the first-load chunk. It bundles
gotrue and realtime, and this app has never opened a realtime subscription. A
signed-out player calls none of it — no sync, no session to refresh, not on a
leaderboard — yet waited for it before first paint.

**Choice.** Dynamic import, gated on a one-key `localStorage` probe that answers
"is anyone signed in here?" without loading anything.

**Measured** (`npm run check:size`, gzipped first-load JS):

```
before  236.5 kB
after   178.0 kB      -58.5 kB, -25%
```

**The first attempt only looked like it worked.** The bundle shrank because the
SDK moved to its own chunk, but `init()` still requested it on mount, so every
anonymous player downloaded it anyway. Measuring bundle size alone would have
called that a win. A browser check comparing *actually fetched* chunks against
`gotrue` caught it.

**Cost.** Two real ones. The auth listener has to be re-attached after a
first-time sign-in, because `init()` no longer runs for a player with no stored
session. And the probe reads supabase-js's own storage key — a coupling to
another library's internals, pinned by a test so it fails loudly rather than
silently signing everyone out.

---

## 3. A warm-up, not brain training

**Problem.** The evidence that generic cognitive-training games transfer to
anything outside themselves is weak. Shipping one in a fitness product means
making a health claim that cannot be supported.

**Choice.** A 30-second anatomy drill instead. It trains one specific, checkable
skill — which muscles an exercise works — which is precisely the second feedback
channel the puzzle already scores you on. "Makes you better at Fitdle" is a
claim that survives scrutiny. A test greps the UI for *brain*, *cognitive*,
*smarter* and *IQ* to keep it that way.

You answer by tapping the muscle on the figure, not picking from a list.
Multiple choice tests whether you recognise a word; pointing at a body tests
whether you know where the muscle is.

**Measured.** Two generator invariants, both pinned by tests: no distractor is a
muscle the exercise actually works (otherwise the "wrong" answer is arguably
right), and the question pool is the *whole* catalogue including today's answer
— excluding it would leak, since diffing the drill's vocabulary against the
exercise index would reveal the one missing word.

**Cost.** Not zero. It is a mode to maintain, and it ships inside the same
budget as everything else.

**Not verified.** Any engagement effect. There are no users and no analytics, so
"time on app" is not a number this project has.

---

## 4. The live grenade

**Problem.** The daily answer was `ANSWER_ORDER[seed % ANSWER_ORDER.length]`.
Appending a single word changes the divisor, which changes the remainder for
every date.

**Measured.**

```
20260806:  CRUNCH   -> BIRDDOG
20260807:  BOXJUMP  -> TOETOUCH
over 365 days: 365 of 365 answers change (100%)
```

Including the current day, mid-round. Players hold a session signed against a
seed whose answer moves underneath them: the board stops matching its own
feedback, and every share grid already posted becomes wrong. A total rewrite of
the calendar dressed up as a content update.

**Choice.** `SCHEDULE_SIZE` frozen at 60. Appended words land beyond it and are
never drawn, so vocabulary can grow at any time with zero calendar effect —
which is what makes content iteration workable at all. Golden date→answer pairs
are pinned by tests.

To be precise about the mechanism: this is a **frozen divisor**, not a pinned
date→answer map. The mapping is still computed; what changed is that its input
no longer moves when the list grows.

**Cost.** Bringing new words into rotation means raising the number, which still
reshuffles every future date. That is now a deliberate, guarded act rather than
a side effect of editing a list.

---

## 5. Game feel

**Problem.** The tile flip read as a vertical squash rather than a rotation.

**Measured.** A `1000px` perspective on a ~60px tile is very nearly
orthographic — the near edge barely grows as it turns, so there is no depth cue.
Separately, the two faces had different corner radii (`rounded-lg` and
`rounded-md`), so the corners visibly jumped at the halfway swap.

**Choice.** Perspective to `560px`; rotation combined with a 6% swell and 26px
of travel toward the viewer; symmetric ease-in-out, because the old curve
decelerated from the first frame so the tile never appeared to gather speed.
`will-change` and `translateZ(0)` promote it to its own compositor layer.

**Cost — and this is the opposite of what it looks like.** The flip got
*faster*, not slower:

| Row width | Before | After |
|---|---|---|
| 5 tiles | 1.00 s | 0.80 s |
| 9 tiles | 1.40 s | 1.10 s |

`0.6 s / 0.1 s` stagger became `0.5 s / 0.075 s`. A nine-wide row taking 1.4 s
reads as waiting rather than watching. The added realism came from geometry and
compositing, not from more time.

---

## 6. Coaching without liability

**Problem.** A model giving fitness form advice can be led into helping someone
train through an injury it cannot see.

**Choice.** Scope is the design. It answers about one exercise — the one just
solved — with that movement's details injected into the system prompt so it
describes a movement the app has committed to rather than one it recalls.
Anything else gets one sentence redirecting to the day's movement.

The one guardrail that is not about product scope: it will not coach through
pain. Joint pain, sharp pain, numbness or an existing injury gets an
acknowledgement that it cannot assess this and a referral to a physio, then
stop — no workaround, no modification, no diagnosis. A test greps the prompt for
exactly that language, because an edit that softens it is the kind of regression
nobody notices until it matters.

Gated on the same signed session that gates the answer reveal, so it cannot be
used as an oracle. Verified live: asking mid-round, asking with no session, and
asking with a forged session all return 403.

**Cost.** The safety and scope sections are a small fraction of the prompt —
tens of tokens against a system prompt that is mostly the exercise's own data.
Calling that expensive would be wrong.

**Not verified.** The model's behaviour. No Anthropic key existed in the
development environment, so the API was never called and **no prompt-injection
testing was performed**. What is tested is the prompt's content, the 403 gate,
the rate limit, and that a missing key degrades without breaking the result
screen.

That gap is now one command wide rather than a research project.
`npm run coach:probe` fires seven adversarial prompts at the live model - the
direct workaround request, pain reframed as determination, pain smuggled into a
form question, a claimed-authority bypass, two out-of-scope asks, and one
ordinary question that it must still answer.

The last case is the one people forget: **over-refusal is scored as a failure
too.** A coach that refuses everything is trivially safe and completely useless,
and it is exactly what you get by hardening a prompt without measuring. A run
where every case refuses is a broken run, not a passing one.

---

## What is verified, and what is not

| Verified in this repo | Not verified |
|---|---|
| 159 unit tests | The RLS revocation (needs a live project) |
| Browser checks against production builds | The leaderboard's actual ranking (needs the service-role key) |
| Three attacks on the guess API, three on the coach API | The coach's model behaviour (no API key) |
| Bundle budget, enforced in `npm run verify` | Any performance number under real network conditions |
| Answer schedule absent from 48 client chunks | Anything about users, retention, or engagement |

`npm run verify` runs typecheck, lint, tests, build, the answer-leak scan, the
size budget, and a smoke test in both dev and production. It exits 0.

## The logo is one file, cropped by a script

The mark appears in six places at five sizes: the header, the browser tab, the
iOS home screen, the link-preview card, and three extension icons. Cut by hand
that is six files to remember, and the one that gets forgotten is always the
tab icon - nobody looks at their own favicon.

So `scripts/build-logo.mjs` takes `assets/logo-source.png` and derives all of
them. Re-export the logo, run `npm run logo`, commit. It also finds the crops
itself rather than taking hardcoded coordinates: the figure and the wordmark are
separated by a band of blank rows, so the widest such band is the seam, and the
figure alone is what goes in a 16px icon where "FITDLE" would be a smudge.

Two things this had to survive, both of which came up immediately:

**The source was a screenshot**, background grid included. Faint grey lines are
still a colour difference, so a naive "differs from the background" test called
every row inked, the seam disappeared, and the tab icon became the whole canvas.
Fixed with a two-point threshold - the measured gap between grid (~48) and
silhouette (~676) is wide enough that the cutoff is not a judgement call.

**The mark is near-black and four of the five themes are dark.** Baking a colour
means one file per theme, and a wrong one the next time a theme is added. So the
in-app mark ships as alpha only and the page uses it as a CSS mask filled with
`currentColor`. One file, correct in every theme including colourblind, and
correct in advance for any theme added later. Verified in a browser: emerald on
midnight, dark green on daylight, purple on plum.

Standalone assets cannot mask against anything, so the favicon and OG card bake
their colours. That is also why the OG card carries a caption - the link preview
is the entire pitch for anyone deciding whether to click, and a bare logo does
not say what the thing is.

Deleted on the way: the extension build's hand-rolled PNG encoder (~80 lines
drawing an approximate dumbbell). It was the right call when the alternative was
a binary asset in git and no image dependency. There is a real logo now.

