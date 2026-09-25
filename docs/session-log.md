# Session log

One entry per iteration. Appended, never rewritten.

---

## Iteration 1 — audit only, no code changed

**What I audited.** Everything: `src/` (server, lib, app, components, data,
store), all 19 test files, `supabase/schema.sql`, `extension/manifest.json`, all
eight scripts, `next.config.ts`, README, DECISIONS, SECURITY, and the running
app. Written up in [docs/audit-2026-09-18.md](audit-2026-09-18.md).

**What I found.** Three things that are broken in the running system and pass
every static check, which is the exact class this repo says keeps biting it:

1. **The opening call can be brute-forced.** `/api/call` refuses a second call
   only if the token *you send it* carries one, so calling with no token is
   always a first call. Six requests this session found the day's muscle group
   and were handed the equipment hint at guess zero, with no forfeit. Averaged
   over all 62 scheduled answers that narrows 19.8 same-length candidates to
   2.7 — and on 27 of 62 days to exactly one. `tests/openingCall.test.ts` has a
   test named "calling is a genuine risk, not a free hint"; it passes, because
   it tests a pure function that cannot see the route.
2. **A signed-in player who asks the guide a question before ever playing gets
   HTTP 500 on the guess that ends their round.** `fitdle_claim_ai` seeds
   `save = '{}'`, `normalise` does not backfill `distribution`, and `reconcile`
   throws inside `/api/guess` with no try/catch. Reproduced end to end against
   the live project: the probe won on GOBLET and got a 500 instead of a reveal.
3. **"Reset my statistics" is broken for signed-in players.** The RLS revocation
   took `update`/`insert` from the client, and `pushCloudSave` is an upsert —
   42501. The reset clears local storage only, and the next sync merges the
   surviving cloud row back in. The test whose comment names `overwriteCloud` as
   the fix still passes.

And two guards that cannot fail: `cloud:check`'s revocation probe (anonymous
caller, non-existent row — the old policy would produce the identical green
tick) and, structurally, ~50 assertions that regex the source instead of running
it. No route handler is invoked anywhere in the suite.

**What I chose.** Nothing yet — iteration 1 is the audit. The ranked backlog and
the reasoning behind it, including what I rejected, is at the end of the audit
discussion rather than here.

**What I changed.** `docs/audit-2026-09-18.md` (new), this file (new). No source
file was touched.

**Mutation table.** None — nothing was fixed this iteration.

**Measurements, with the command.**

| Measurement | Command |
|---|---|
| 220 tests, 220 pass, 0 fail | `npm run verify` (test step) |
| 36 client chunks scanned, no leak | `npm run verify` (check:bundle) |
| 164.9 kB first-load, 97% of the 170 kB budget | `npm run verify` (check:size) |
| all 10 theme combinations clear AA | `npm run verify` (check:contrast) |
| verify exit code **1** | `npm run verify` |
| every cloud check green except Redis | `npm run cloud:check` |
| call brute force: 6 requests → group + equipment | node probe against `http://localhost:3000` |
| 19.8 → 4.3 → 2.7 mean candidates; 27/62 days reduced to 1 | node probe over `CATALOGUE` + `ANSWER_ORDER` |
| owner UPDATE 0 rows, INSERT/UPSERT 42501, DELETE ok, streak unchanged | node probe, live Supabase, throwaway account |
| `/api/guess` 500 on the winning guess | node probe, live Supabase + live dev server |
| 99 catalogue / 62 scheduled / 60 with video / 26 non-bodyweight | node probe over the data modules |

**What I did NOT verify.**

- **`npm run smoke` did not run in either mode.** dev was blocked by a `next dev`
  already running for this directory (PID 213754, not mine — left alone); prod
  crashed because Playwright's chromium is not installed in this environment and
  nothing in `npm ci` or the README installs it. So the browser step — the one
  that exists because unit tests missed two real regressions — has no result
  this session, in either mode.
- **`npm run coach:probe` did not run.** No `ANTHROPIC_API_KEY` in `.env.local`.
  Everything said about the coach's and guide's model *behaviour* is therefore
  unchanged from what DECISIONS.md already records: untested. I found no way
  past the injury guardrail because I could not call the model.
- **`npm run build:extension` did not run.** The permissions finding is from
  reading `extension/manifest.json` and grepping `src/` for `chrome.*`, plus
  confirming `build-extension.mjs` copies the manifest verbatim. I have not
  loaded the built extension in Chrome.
- **`npm audit`** was not run.
- **`check:bundle`'s first-occurrence weakness is reasoned, not demonstrated.**
  I have not planted a schedule leak and shown the scan miss it.
- The `/api/call` exploit was run against a **dev** server. I have no reason to
  think production differs — the route is `force-dynamic` in both — but I did
  not re-run it against `next start`.
- Nothing about latency, users, engagement, or cost.

**Found and not fixed — enough detail to resume.**

Everything in the audit. The three criticals are §1, §2, §3; the two hollow
guards are §4; the source-grep problem is §5; the extension permissions are §6;
the guide's "construction vs instruction" gap is §7; fifteen wrong numbers and
three stale structural claims across README, DECISIONS, game.ts and schema.sql
are §9; eight smaller items are §10.

Throwaway Supabase accounts created by the probes were deleted in a `finally`
block; both runs printed `cleanup -> ok`. Nothing was left in the project.

---

## Iteration 2 — the opening call can no longer be swept

**What I audited.** `/api/call`, `session.ts`, `callRecord`'s absence,
`counter.ts` / `sharedCounter.ts` / `memoryCounter.ts`, `tests/openingCall.test.ts`,
`src/lib/api.ts`'s error handling, and `tests/resolve-alias.mjs`. Re-read
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
before touching a route handler — nothing there changed the approach; these
routes already use plain `Request` + `NextResponse` with `force-dynamic`, which
is what Next 16 documents.

**What I chose, and why over the alternatives.** Audit §1, the only finding that
lets someone solve the puzzle for free, and the only one you had to decide.
You picked "remember the first call per caller per day". Rejected on the way, and
recorded in DECISIONS §7: hiding `correct` until after guess 1 (still
brute-forceable, and it makes the mechanic worse for honest players), signed-in
only (airtight, but deletes the feature for anonymous players), and deleting the
call entirely (closes it completely; costs the one mechanic a solver cannot play).

I did **not** reuse `counter.ts` with a limit of one, which was the tempting
zero-new-code option. It kills the sweep and also refuses an honest player who
lost their token a call they had already paid for. Storing *which* group makes
the endpoint idempotent instead, for the same amount of code.

**What I changed.**

- `src/server/callRecord.ts` (new, ~110 lines) — the day's call, first writer
  wins, Redis when configured and the process otherwise, failing open.
- `src/server/sharedCounter.ts` — a second Lua script (`SET … NX EX`, read-back
  in the same atomic step) and the Upstash transport extracted so both scripts
  share it. `sharedCount`'s behaviour is unchanged.
- `src/app/api/call/route.ts` — consults the record, keyed by the verified user
  id when signed in and the address when not. A divergent call gets 409 naming
  the group that stands and **no outcome** for the group just asked about.
- `src/lib/api.ts` — a 4xx now surfaces the server's own `error` text instead of
  `Server error (409)`. Every 4xx these routes emit is already player-facing, and
  "You already called Chest today" is a rule, not a fault.
- `tests/resolve-alias.mjs` — one line teaching the resolver `next/server`.
  Without it no route handler is importable, which is *why* all six routes were
  asserted against as strings. The tests below are the first here to call one.
- `tests/openingCall.test.ts`, `tests/sharedCounter.test.ts` — 9 new tests; the
  fake Upstash now dispatches on the script it was actually sent.
- DECISIONS §7 (new), SECURITY.md, README security table.

**Mutation table.** Each leg removed, suite re-run, leg restored.

| Leg removed | Test that failed |
|---|---|
| The route's 409 branch (record consulted, result ignored) | `a second call from the same caller is refused, and reveals nothing`; `sweeping every group finds nothing after the first request` |
| The per-caller key (`owner` → a constant) | `one caller cannot spend another caller’s call` |
| The seed from the record key | `the record is per day, so tomorrow is a fresh call` |
| First-wins in the local record (last writer wins) | `a second call from the same caller is refused…`; `sweeping every group…`; `the record is per day…`; `an unreachable Redis costs the player their call rather than refusing it`; `with nothing configured the record is in-process, and still first-wins` |
| The shared store (never consult Redis) | `a second instance sees the first instance’s opening call` |
| `NX` from the Lua (last writer wins in Redis) | `the first caller wins the key and later ones are told who won`; `a second instance sees the first instance’s opening call` |

**Two legs survived the first pass, and both were test bugs.**

- *The per-caller key.* `one caller cannot spend another caller’s call` had both
  callers ask for the **same** group, so a record keyed by nothing still replayed
  a 200 for the second one. Fixed: the second caller asks for a different group
  and asserts it gets the outcome for the group **they** asked about.
- *`NX` in the Lua.* The fake Upstash implemented set-if-absent in JavaScript
  whatever the script said, so it was a fake of our intentions rather than of
  Redis. Fixed: it reads `'NX'` out of the script body and overwrites when it is
  absent.

Without the mutation pass both would still be in the suite looking green. This
is the second time in this repo that the technique has caught a bad test rather
than bad code.

**Measurements, with the command.**

Live, against the running dev server, before and after — same sweep, same script:

```
before                                   after
call Chest -> correct=false              call Chest -> 200 correct=false
call Back  -> correct=false              call Back  -> 409 "You already called Chest today."
call Shou. -> correct=false              call Shou. -> 409  (no call, no hints)
call Arms  -> correct=false              call Arms  -> 409
call Core  -> correct=false              call Core  -> 409
call Legs  -> correct=TRUE, "Dumbbell"   call Legs  -> 409
```

Honest path, also live: call Legs → `{group:'Legs',correct:true}` + equipment
"Dumbbell"; discard the token and call Legs again → identical outcome, 200, not
a refusal; resume with the returned token → the call is still there.

Candidate arithmetic, over all 62 scheduled answers (node probe over `CATALOGUE`
and `ANSWER_ORDER`): length only 19.8, + group 4.3, + equipment 2.7, and exactly
one candidate on **27 of 62** days.

| Step | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| tests | `npm test` | 229 tests, 229 pass, 0 fail (was 220) |
| build | `npm run build` | ok; `/` and `/play` static, six API routes dynamic |
| answer leak | `npm run check:bundle` | clean, 36 files scanned |
| size | `npm run check:size` | 164.9 kB, 97% of the 170 kB budget — unchanged |
| contrast | `npm run check:contrast` | every combination clears its bar |
| smoke, prod | `npm run smoke -- prod` | **all 10 checks passed** |

`check:size` is unchanged to the tenth of a kB, which is expected: everything
added is server-side, and the one client edit is inside an existing branch.

**What I did NOT verify.**

- **`npm run smoke -- dev` did not run**, and therefore neither did
  `npm run verify` end to end. A `next dev` belonging to someone else is running
  for this directory (PID 213754) and Next allows one per project; I left it
  alone rather than killing a server I did not start. Production smoke passed in
  full. The change is a server route plus one branch of a client error path, and
  neither historic dev-only regression (a CSP directive, a module-scope date) has
  a counterpart here — but that is an argument, not a measurement.
- I **installed Playwright's browsers** (`npx playwright install chromium` and
  `chromium-headless-shell`) to get prod smoke running at all. `npm ci` does not
  install them and nothing in the README says to. That is audit §0 and it is
  still unfixed in the repo.
- `npm run coach:probe` — no `ANTHROPIC_API_KEY`. Untouched this iteration.
- `npm run build:extension` — not touched this iteration, not run.
- The Redis path is proved against a **fake** Upstash that speaks the REST
  protocol over real HTTP, not against Upstash itself. No Redis is configured
  here.
- The 409 reaching the player as readable text is asserted at the API layer, not
  observed in the UI.

**Found and not fixed — NEW, and it is worse than the one I just fixed.**

**The guess history can be discarded, so the daily leaderboard and the streak
are both forgeable.** Same root cause: the signed session is the server's only
memory of the day, and the client decides whether to send it. Measured live:

```
burn five guesses          1..5, status=won on the fifth
POST /api/today with no token   ->  fresh board, 0 guesses, status=playing
win in one on the fresh board   ->  status=won, guesses banked = 1
```

For a signed-in player `/api/guess` banks that `1` to the server, and the
"Today" board ranks by fewest guesses. So anyone can take the top of the daily
board by playing normally, clearing storage, and replaying. Worse, a player
five guesses deep and wrong can restart instead of submitting the sixth, so a
streak **can never break** — you simply never finish a day you are losing.

`commitResult` is idempotent per seed, so you cannot improve a round you have
already finished. You control when you finish, which is the hole.

README already names this exact mechanism, for the *speed* board it decided not
to build: *"anything that did would reset by discarding the session and asking
for a fresh one."* The same sentence applies to guess count and to finishing at
all, and that was not noticed.

The fix is the same shape as this iteration's but stores a floor rather than a
value: record the highest guess count seen for (caller, seed) and bank
`max(recorded, tokenCount)`, plus refuse to reopen a day whose record shows
guesses already spent. Anonymous players are address-keyed and therefore a speed
bump again; signed-in players — the only ones on the leaderboard — are keyed by
verified id and genuinely covered. That is the next iteration unless you say
otherwise.

Everything else from the audit is still open, in the ranked order given there.

**Found and not fixed — SECOND new finding, and it makes the first inert.**

**The "Today" leaderboard can never contain a row.** `commitResult` never writes
`save.day`, so the row the server banks always reads `day_guesses = 0`,
`day_won = false`. Verified through the real route against the live project with
a throwaway account: player wins, `progress written = yes`, and the daily board
query returns **0 rows**. The streak board is fine. Written up as audit §11 and
§12; they have to be fixed together, because fixing the dead board without
fixing the discardable session turns it into a forgeable one.

---

## Iteration 3 — the "Today" board goes from 0 rows to real ones, and the number it ranks stops being resettable

**What I audited.** `bankResult`, `reconcile`, `commitResult`, `DayRecord`,
`isCoherent`, the generated columns in `supabase/schema.sql`, `dailyBoard`, and
`/api/guess`. Traced the board's ranking columns back through the blob they are
derived from to the code that was supposed to write it, and found nothing did.

**What I chose, and why over the alternatives.** Audit §11 and §12 together.
They are one item: §11 alone turns a dead leaderboard into a forgeable one, so
shipping the one-line fix on its own would have been worse than leaving it
broken. You picked the guess floor over the stricter "six recorded guesses ends
the day", which would also close the never-lose hole but can lock a player out
of a day they cleared their browser in the middle of.

Rejected inside that: making `day.guesses` itself carry the total (it would mean
fabricating guesses the player never made, and `isCoherent` rightly requires
real uniform-width names), and ranking on something else entirely (drops the
competitive dimension the board exists for).

**What I changed.**

- `src/server/progress.ts` — `bankResult` writes `save.day` with the real
  guesses, the real status and `spent`. Signature takes the guess array and the
  floor instead of a count.
- `src/lib/secureStorage.ts` — `DayRecord.spent`, optional, with a coherence
  rule that it may exceed `guesses.length` but never undercut it and never
  exceed `MAX_GUESSES`.
- `src/app/api/guess/route.ts` — counts guesses per account per UTC day through
  the existing `counter.ts` (no new primitive) and banks
  `max(counted, board length)`. `verifiedUser` hoisted to the top, because the
  count is needed on every guess rather than only the last.
- `supabase/schema.sql` — `day_guesses` now prefers `save.day.spent`, dropped
  and re-added rather than `add if not exists`, which would have left the old
  expression ranking on any deployed project. The stale "A note on trust"
  paragraph, which contradicted the revocation ninety lines above it, is
  corrected and says it was wrong.
- `scripts/cloud-check.mjs` — probes that the deployed column actually ranks
  `spent`, by comparing the column against the blob on banked rows.
- README — the daily-board section, including an explicit correction of
  "already unforgeable", which was false.
- 7 new tests; one brittle existing test rewritten.

**Mutation table.** Each leg removed, `npm test` re-run, leg restored.

| Leg removed | Test that failed |
|---|---|
| `bankResult` stops writing `next.day` | `bankResult writes the day record, not just the counters` |
| The day is written but always `'playing'` | `bankResult writes the day record, not just the counters` |
| `commitResult` gets the board length, not the floor | `the distribution records what the round cost, not the board length` |
| The route drops the floor (`Math.max` removed) | `the guess route counts guesses per account, not off the token` |
| The counter key drops the account | `the guess route counts guesses per account, not off the token` |
| `isCoherent` stops bounding `spent` | `` `spent` may exceed the board it describes, but never undercut it `` |
| The schema column stops preferring `spent` | `the board ranks `spent`, which a restart cannot lower` |

**One leg survived the first pass again** — swapping `spent` for
`guesses.length` in the `commitResult` call broke nothing, and that is the
difference between a restarted round landing in the six-guess bucket and the
one-guess bucket. `bankResult` cannot be called from a test (it needs a
service-role client and a live project), so the new test pins the argument by
parsing the call. That is weaker than I would like and the log should say so —
what makes me confident is the live run below, which shows
`distribution [0,0,0,0,0,1]`.

**I also mutation-tested the new `cloud:check` probe**, because the audit's §4
is about a probe that could not fail. Planted a real stale-schema row (the
deployed project has not had the new DDL run), then ran the undecorated command:

```
planted row: day_guesses=1  save.day.spent=6
✗ day_guesses ranks the guess ARRAY, not what the round cost (1 of 1 rows disagree)
cloud:check exit code = 1
```

With no banked rounds it reports `? daily board ranking not checked (no banked
rounds to compare against yet)` rather than a green tick, because PostgREST
cannot read a column's definition and pretending otherwise is the §4 mistake.

**Measurements, with the command.**

The dead board, through the real route against the live project, with a
throwaway account — before and after the change:

```
before                                after
day_seed    = 20260917                day_seed    = 20260917
day_guesses = 0                       day_guesses = 1
day_won     = false                   day_won     = true
save.day    = {guesses:[],            save.day    = {seed:20260917, spent:1,
               status:"playing"}                    status:"won", guesses:["GOBLET"]}

rows the "Today" board query returns: 0        rows: 1
```

The floor, same setup — a signed-in player burns five guesses, discards the
token, and wins in one:

```
fresh board guesses = 0
status = won   board shows 1 guess(es)

save.day          = {"seed":20260917,"spent":6,"status":"won","guesses":["GOBLET"]}
save.distribution = [0,0,0,0,0,1]        <- the six-guess bucket
day_guesses (column as deployed)              = 1
day_guesses (expression in the new schema)    = 6
```

The board still shows one guess, which is correct — that is the board. The
round is ranked and recorded as six, which is what it cost.

| Step | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| tests | `npm test` | 236 tests, 236 pass, 0 fail (was 229) |
| build | `npm run build` | ok |
| answer leak | `npm run check:bundle` | clean, 36 files |
| size | `npm run check:size` | 164.9 kB, 97% of the 170 kB budget — unchanged again |
| contrast | `npm run check:contrast` | every combination clears its bar |
| smoke, prod | `npm run smoke -- prod` | all 10 passed |
| cloud | `npm run cloud:check` | green except Redis and the new "not checked" line |

**What I did NOT verify.**

- **The schema migration has not been applied to the live project.** I wrote the
  DDL and proved the new expression by evaluating it over a real banked row, but
  I did not run `drop column … add column` against your database — that alters
  your schema and is yours to run. Everything measured above is therefore on the
  **old** column, which is why the two `day_guesses` lines differ. Run
  `supabase/schema.sql` and then `npm run cloud:check`; the new probe will turn
  from `?` to `✓` or fail loudly.
- **`npm run smoke -- dev`, and therefore `npm run verify` end to end.** Same
  reason as iteration 2: a `next dev` is holding Next's one-per-project lock and
  I left it alone. Prod smoke passed in full.
- The smoke test still never submits a guess in a browser, so none of this
  iteration's behaviour is covered there. That is backlog #5 and it is now the
  most valuable remaining item.
- `coach:probe` (no API key) and `build:extension` — untouched, unrun.
- The per-account counter under Redis is covered by the fake Upstash only; no
  Redis is configured here.
- The extra `verifiedUser` call per guess adds a Supabase token verification to
  every guess for signed-in players. I did not measure the latency it adds.

**Found and not fixed.**

- **A streak still need never break.** A player five guesses deep and wrong can
  discard rather than submit the sixth. The floor records the guesses but
  nothing forces the round closed, and forcing it is the option you did not
  pick. Audit §12.
- Everything else from the audit: §2 (the `{}`-row 500, now the highest-value
  item left), §3 (reset uses an upsert RLS refuses), §4 (the two guards that
  cannot fail), §5, §6 (extension permissions), §7, §9 (fifteen wrong numbers),
  §10.

---

## Iteration 4 — the 500 that cost a player a won round

**What I audited.** `readRow`, `normalise`, `isCoherent`, `reconcile`,
`defaultSave`, the `fitdle_claim_ai` insert, and the bank call site in
`/api/guess`. Re-derived the crash from first principles rather than trusting
iteration 1's write-up, and checked where `normalise` is called from: the local
path runs `isCoherent` **before** it (`loadSave`, line 343); the server path did
not.

**What I chose, and why.** Audit §2 — the only remaining finding that loses a
real player a real result, and the one item left that needed no decision from
you. Higher value than §3 (reset), which is annoying but recoverable, and than
§4/§6/§9, which are about guards and documents rather than about players.

Rejected: seeding a full default save from `fitdle_claim_ai` instead of `{}`.
The SQL would then have to know the save's shape, which is a second source of
truth for a structure that changes, and `{}` is the honest encoding of "has not
played" — the generated columns read null out of it, which is right.

Also rejected: making `normalise` fill in the missing fields. It is an upgrade
function, not a repair function; teaching it to invent a `distribution` would
also quietly repair records that ought to be rejected, which is the opposite of
this codebase's fail-closed posture on saves.

**What I changed.**

- `src/lib/secureStorage.ts` — `isCoherent` exported, for the same reason
  `reconcile` and `commitResult` are imported by the server rather than
  reimplemented: one rule, not two.
- `src/server/progress.ts` — `readRow` validates the stored row before
  normalising it and returns null for anything that is not a usable save, so
  `bankResult` falls back to `defaultSave()`. For the `{}` case that is exactly
  right, since that is what `{}` means.
- `src/app/api/guess/route.ts` — the bank sits inside a try/catch. The result is
  already computed and is returned regardless.
- README — the "Fails soft" bullet now says it was false and what made it true.
- 5 new tests; the brittle round-over test rewritten again, this time to assert
  by position rather than by the shape of the code around the call.

**Mutation table.**

| Leg removed | Test that failed |
|---|---|
| `readRow` stops validating the row | `the server validates a stored row before trusting it` |
| The bank is no longer wrapped | `a throw while banking cannot cost the player their result` |
| `isCoherent` un-exported | `tests/progress.test.ts` fails to import — loud, but a module error rather than the named test (`the server uses the browser’s coherence rule, not a second opinion`) |
| `normalise` "repairs" instead of upgrading | `normalise does not, and must not, invent the fields reconcile needs` |

**Measurements, with the command.**

The exact flow, through the real routes against the live project, before and
after — throwaway account created and deleted inside the probe:

```
before                                    after
fitdle_claim_ai -> ok                     fitdle_claim_ai -> ok
row.save now = {}                         row.save now = {}
guess 1 BRIDGE -> playing                 guess 1 CARRY  -> playing
…                                         …
guess 5 GOBLET -> HTTP 500                guess 6 HINGE  -> lost, progress written
```

and the win path, which is the one that hurt:

```
the player asked the guide a question first; row.save = {}
then won in one: HTTP 200  status=won  streak=1
row -> {"streak":1,"day_seed":20260918,"day_won":true,
        "day":{"seed":20260918,"spent":1,"status":"won","guesses":["SQUAT"]}}
```

**A claim I checked that turned out to be true.** `schema.sql` argues the AI
quota columns are kept out of the save blob so an AI question cannot touch the
streak row's history. I verified the converse, which nobody had: a player on
`tier = 'pro'` with `ai_count = 3` finishes a round, and the bank's upsert
leaves `tier`, `ai_day` and `ai_count` exactly as they were.

| Step | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| tests | `npm test` | 241 tests, 241 pass, 0 fail (was 236) |
| build | `npm run build` | ok |
| answer leak | `npm run check:bundle` | clean, 36 files |
| size | `npm run check:size` | 164.9 kB, 97% of budget — unchanged a third time |
| contrast | `npm run check:contrast` | every combination clears its bar |
| smoke, prod | `npm run smoke -- prod` | all 10 passed, 5 columns today |

**What I did NOT verify.**

- **`npm run smoke -- dev`, and so `npm run verify` end to end** — third
  iteration running. The `next dev` holding Next's project lock is not mine and
  I have not killed it. Prod smoke passed in full each time.
- The try/catch is asserted by reading the route, not by forcing a throw through
  it. I could not make `bankResult` throw on demand without a fault-injection
  seam, and adding one for a test is the kind of thing this repo's style rules
  say not to do. What I have instead is the real reproduction above, on the real
  cause.
- `coach:probe` (no key), `build:extension` (untouched).
- The `isCoherent` guard rejects a genuinely corrupt-but-real row too, and that
  player's server-side record restarts from zero on their next completed round.
  I judged that better than a 500, and it cannot happen from client input — the
  client has no write permission — but I have not seen it happen.

**Found and not fixed.** Audit §3 (reset uses an upsert RLS refuses), §4 (the
`cloud:check` revocation probe that cannot fail, and `check:bundle`'s
first-occurrence window), §5, §6 (extension permissions), §7, §9 (fifteen wrong
numbers, three stale structural claims), §10, §12's remainder (a streak still
need never break).

---

## Iteration 5 — "reset my statistics" reaches the cloud again

**What I audited.** `resetProgress`, `overwriteCloud`,
`overwriteCloudIfSignedIn`, `pushCloudSave`, `syncSave`, `mergeSaves`, the RLS
policies, and what a row carries besides the save. Re-derived the failure rather
than trusting iteration 1, and probed the old path live before changing it.

**What I chose, and why.** Audit §3 — the last finding that is broken for a real
player today and needs no decision from you. Ranked above §4 (guards that cannot
fail) and §9 (wrong numbers) because those are about the repo's own confidence
rather than about somebody losing a feature.

**A decision inside it that changed the shape of the fix.** The obvious repair
is the one the code already sign-posts: RLS grants DELETE, so delete the row.
That works — measured, one row removed — and it also takes `tier`, `ai_day` and
`ai_count` with it. Those are deliberately *not* in the save blob, by the
schema's own argument, and a statistics reset that silently cancels somebody's
paid tier is a worse bug than the one being fixed. So the reset clears the save
and leaves the rest of the row alone, through a security-definer function that
takes no arguments and writes one column. Deleting is kept as the fallback for a
project that has not run the newer schema, because a reset that does nothing is
worse than one that over-deletes a tier nobody has set yet.

This is a new SQL function, which is a migration. It is not a new *pattern*:
`fitdle_claim_ai` is already a security-definer RPC with its grants pinned by a
test, and this one is narrower — no parameters, so there is nothing to point at
a stranger's record.

**What I changed.**

- `supabase/schema.sql` — `fitdle_reset_progress()`, revoked from `public`/`anon`
  and granted to `authenticated`, reading `auth.uid()` itself.
- `src/lib/cloudSync.ts` — `pushCloudSave` (an upsert RLS refuses) replaced by
  `clearCloudSave`, with the delete fallback.
- `src/store/useAuthStore.ts`, `src/store/useGameStore.ts` — call sites.
- `scripts/cloud-check.mjs` — probes for the function by calling it
  unauthenticated and expecting 42501.
- `SECURITY.md` — the RLS revocation moves out of "Not verified", with the
  caveat that `cloud:check` is not what verified it.
- 6 new tests, 1 vacuous test replaced.

**Mutation table.**

| Leg removed | Test that failed |
|---|---|
| `clearCloudSave` goes back to an upsert | `the reset clears the record instead of writing one` |
| The RPC takes a user id | `the reset cannot be pointed at somebody else` |
| The `authenticated` grant is dropped | `the reset is granted to signed-in players and nobody else` |
| The reset also clears `tier` | `the reset leaves billing state alone` |
| `syncSave` gains a write | `syncSave writes nothing at all`; `the reset clears the record instead of writing one` |
| `resetProgress` stops touching the cloud | `resetting progress actually reaches the cloud` |
| The delete fallback is removed | `a project without the reset function still resets` |

**Two legs survived the first pass again** (the reset not touching the cloud at
all, and the fallback being removed) and now have tests. And one of those new
tests was itself broken when written — it sliced from `indexOf('resetProgress:
(')`, which finds the *interface declaration* rather than the implementation, so
it failed on unmutated code. The mutation pass is what surfaced it; without it I
would have shipped a test that fails for a reason unrelated to its subject.

**I also replaced a test that had become vacuous.** `syncSave no longer pushes`
asserted `!body.includes('pushCloudSave')` — which became automatically true the
moment `pushCloudSave` was deleted. It now asserts that the pull side contains no
write verb at all.

**Measurements, with the command.**

Live, through the real API and the real database, with a throwaway account — the
old path and the new one side by side:

```
after winning         : {"streak":1,"day_won":true}
OLD reset (upsert)    : 42501 new row violates row-level security policy
  record afterwards   : {"streak":1,"day_won":true}   <- the reset did nothing
NEW reset (rpc)       : PGRST202 Could not find the function   (schema not migrated)
  fallback (delete)   : removed 1 row(s)
  record afterwards   : gone
  next sync would pull: nothing
```

`npm run cloud:check` against the live project now reports the missing function
as a failure, with the fix named — no mutation needed to prove it can fail,
because the real condition is present:

```
✗ the function fitdle_reset_progress is missing
  → Re-run supabase/schema.sql. Until then "reset my statistics" falls back to
    deleting the whole row, which also clears tier and the AI counters
```

| Step | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| tests | `npm test` | 247 tests, 247 pass, 0 fail (was 241) |
| build | `npm run build` | ok |
| answer leak | `npm run check:bundle` | clean, 36 files |
| size | `npm run check:size` | 164.9 kB, 97% of budget — unchanged a fourth time |
| contrast | `npm run check:contrast` | every combination clears its bar |
| smoke, prod | `npm run smoke -- prod` | all 10 passed |

**What I did NOT verify.**

- **`fitdle_reset_progress` itself has never run.** It does not exist on the live
  project and I did not create it — that is DDL against your database. What I
  verified is the *fallback*, live, and that `cloud:check` detects the absence.
  The function's own behaviour, its grants, and the `auth.uid()` guard are
  asserted from the SQL text only.
- **The live reset probe replicates the two calls `clearCloudSave` makes rather
  than invoking the module.** `clearCloudSave` reaches Supabase through
  `@/lib/supabase`, which needs browser storage. The protocol is verified; the
  function body is covered by tests, not by that run.
- **`npm run smoke -- dev`, and so `npm run verify` end to end** — fourth
  iteration. Same `next dev` holding Next's project lock.
- The UI path (Stats modal → "Reset") was not clicked. The smoke test still does
  not submit a guess, let alone open a modal.
- `coach:probe` (no key), `build:extension` (untouched).

**Found and not fixed.** Audit §4 (the `cloud:check` revocation probe that cannot
fail; `check:bundle`'s first-occurrence window), §5, §6 (extension permissions),
§7, §9 (fifteen wrong numbers, three stale structural claims), §10, and §12's
remainder (a streak need never break — the option you did not pick).

**Two migrations are now pending on the live project**, both detected by
`npm run cloud:check`: the `day_guesses` column (iteration 3) and
`fitdle_reset_progress` (this one). Re-running `supabase/schema.sql` applies
both; the checks turn from `✗`/`?` to `✓` or fail loudly.

---

## Iteration 6 — the two guards that could not fail, both now demonstrated

**What I audited.** `scripts/cloud-check.mjs`'s write-policy probe and
`scripts/check-bundle.mjs`'s run scan — audit §4, the only finding that is about
the repo's own confidence rather than about a player. Re-derived both from the
source rather than trusting iteration 1, then tried to make each one fail.

**What I chose, and why.** Everything player-facing from the audit is now fixed.
What is left is §4 (hollow guards), §5 (behavioural coverage), §6 (extension
permissions), §7 and §9 (documents). §4 first, because a guard that cannot fail
is worse than no guard: it is the reason the other findings survived this long,
and both of these sit on properties the repo describes as load-bearing.

**What I changed.**

- `scripts/cloud-check.mjs` — the write-policy probe now creates a throwaway
  account with the service-role key, seeds a row for it the way the API would,
  signs in as that account with the **public anon key**, tries to rewrite its own
  row with `streak: 9999`, reads the row back with the service-role key, and
  deletes both row and account in a `finally`. A leftover account id is printed
  loudly rather than swallowed.
- `scripts/check-bundle.mjs` — the run scan walks every occurrence of the anchor
  instead of only `text.indexOf(run[0])`.
- `tests/helpers/source.ts` — its own guidance corrected; see below.
- 2 new tests.

**The demonstrations, which are the point of this iteration.**

*`check:bundle` was missing a real leak.* Iteration 1 called this "reasoned, not
demonstrated". It is demonstrated now. The whole of `ANSWER_ORDER` was appended
as a JSON array to the built chunk that already carries the public catalogue —
35 kB past the first occurrence of the anchor, which is where the catalogue's own
copy sits:

```
planting into .next/static/chunks/0dmpsijn___dl.js
  first occurrence of SQUAT is at byte 2481 (the catalogue)
  schedule appended at byte 37248

$ npm run check:bundle          # as it stood
✓ no answer ordering, coaching text or video ids in any client chunk (36 files scanned)
EXIT=0

$ npm run check:bundle          # after
✗ answer ORDER leaked in .next/static/chunks/0dmpsijn___dl.js
  found consecutive run at byte 37266: SQUAT -> BURPEE -> CLIMBER -> DEADLIFT -> HIPTHRUST
EXIT=1
```

Every future puzzle, sitting in a chunk the browser downloads, and the guard said
clean. The planted chunk was restored from a copy and the clean tree passes
again; `ls .next/static/chunks/*.orig` returns nothing. Runtime is unchanged at
`0.40s total`.

*`cloud:check`'s revocation probe.* Against the live project it now signs in as
the row's own owner and reports:

```
✓ client writes are revoked   the row's own owner updated 0 rows and the record is unchanged
```

which is conclusive in a way the old line was not: the row exists, it belongs to
the caller, and it is unchanged afterwards. The old line —
`✓ client writes are revoked  no row was updatable` — came from an anonymous
caller updating a row id that does not exist, which the **old** policy would
have answered identically.

I could not create the failing condition, because installing the old policy is
DDL against a database that is not mine. What I did instead was feed the
detector its failure signal — seed the probe row already marked `forged` — and
confirm the branch fires and the script exits 1:

```
✗ a signed-in player CAN rewrite their own progress row - the old write policies are still in place
  → Re-run supabase/schema.sql; it drops "insert own progress" and "update own progress".
    Until then any streak on the leaderboard is whatever the browser typed
EXIT=1
```

**Mutation table.**

| Leg removed | Test that failed |
|---|---|
| `cloud:check` goes back to the anonymous probe | `cloud:check proves the revocation instead of assuming it` |
| `cloud:check` stops cleaning up (no `finally`) | same test |
| `check:bundle` goes back to the first occurrence | `the leak scan looks at every occurrence, not just the first` |

**The cleanup leg survived the first pass, and the reason is worth keeping.**
`assert.match(probe, /finally/)` passed with the `finally` block deleted, because
the comment above it says the word "finally". That is precisely the failure
`tests/helpers/source.ts` was written to prevent — and its own guidance is what
let it through: *"absence checks read the CODE, and presence checks can read the
whole file."* That holds only when what you are asserting is prose. A presence
check for a code **construct** has the same problem in reverse. The helper's
comment now says so, and the test strips comments before asserting.

**Also checked, because these probes create real accounts.** After every probe
run in this session:

```
total auth users: 1
probe accounts left behind: 0 []
rows in fitdle_progress: 1
```

| Step | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| tests | `npm test` | 249 tests, 249 pass, 0 fail (was 247) |
| build | `npm run build` | ok |
| answer leak | `npm run check:bundle` | clean, 36 files, 0.40s |
| size | `npm run check:size` | 164.9 kB, 97% of budget — unchanged a fifth time |
| contrast | `npm run check:contrast` | every combination clears its bar |
| smoke, prod | `npm run smoke -- prod` | all 10 passed |
| cloud | `npm run cloud:check` | revocation now proved; two migrations still pending |

**What I did NOT verify.**

- **The revocation probe against a project that actually has the old policies.**
  That needs DDL on your database. What is proved: the passing branch is
  conclusive, and the failing branch fires and exits 1.
- **`npm run cloud:check` now creates and deletes an auth account on every run.**
  That is a real side effect on your project — one MAU, one row, both removed in
  a `finally`. I judged that worth it because the alternative is a green tick
  that means nothing, but it is a cost you did not ask for and you may want it
  behind a flag. I did not add one, because a flag that CI does not pass is how
  the default stops being exercised.
- **`npm run smoke -- dev`, and so `npm run verify` end to end** — fifth
  iteration, same `next dev` holding Next's project lock.
- `coach:probe` (no key), `build:extension` (untouched).
- `check:bundle`'s coaching-text and video-id scans still use a plain
  `includes`, which has no window problem, and I did not plant anything against
  them.

**Found and not fixed.** Audit §5 (the smoke test still never submits a guess),
§6 (extension permissions: `https://*/*` and an unused `"storage"`), §7
(`coach:probe` reports "n of 7" across 14 cases; the guide's "safe by
construction" claim covers the app's data but not the model's own knowledge), §9
(fifteen wrong numbers, three stale structural claims), §10, and §12's remainder.

Two migrations remain pending on the live project, both reported by
`npm run cloud:check`: the `day_guesses` column and `fitdle_reset_progress`.

---

## Iteration 7 — the smoke test plays a whole round, and `verify` finally runs end to end

**What I audited.** `scripts/smoke.mjs` in full, the game's DOM through a real
browser (to find selectors that are not invented), `useGameStore`'s input gate,
and `Tile.tsx`'s flip. Audit §5.

**What I chose, and why.** Everything else left is documents (§7, §9) or the
extension manifest (§6). §5 is the one that would have caught the bugs this
session found: three of the five - a leaderboard that could never hold a row, a
500 on the winning guess, and a reset that silently did nothing - are properties
of the running system, and the browser check stopped at "the page came up".

**What I changed.** `scripts/smoke.mjs` only, plus a README line.

The round is played through the UI, in both modes: open the in-app exercise
list, take the day's candidates from it (so the script keeps no word list of its
own and cannot drift from one), type each with the physical keyboard, press
Enter, and continue until the server says the round is over. Four new checks:

- **a guess reaches the server and comes back scored** — every tile in row one
  carries one of the spec's three result colours, read from `getComputedStyle`.
- **a guess sharing a letter with the answer lights a tile** — see the mutation
  notes; the check above is not evidence of scoring on its own.
- **the round plays to a finish** — the server reports `won` or `lost`.
- **the answer is absent from every payload sent mid-round** — every `/api/`
  response body is captured as text; once the reveal names the answer, all the
  payloads captured while `status` was `playing` are searched for it
  retrospectively. This is the property `check:bundle` cannot test: not "is the
  schedule in the bundle" but "does the running server hand it over early".

Plus: a missing Playwright browser now reports one line and a failed check
instead of throwing an uncaught `TimeoutError` out of the script.

**Two things I got wrong while building it, both worth recording.**

*The round-over signal.* The first version watched the DOM for the result
dialog. That modal is opened by a timer 0.9–1.5 s after the last row flips, so
the loop typed one guess too many into a board the client had already closed, no
request was made, and the run died 20 s later on a round that had ended
correctly. The status comes off the `/api/guess` response now.

*The "wait for the flip" signal.* The second version waited for the back faces
to take a result colour. That is not a signal at all: the back face is painted
from the start and merely rotated away by `backface-visibility`, so it reads as
revealed before the flip begins — and the client ignores keystrokes while a row
is revealing. Replaced with typing the word and confirming it landed, retrying
if not, which needs no timing constant and self-corrects.

**Mutation table.** Each leg applied to the app, `npm run smoke -- prod` re-run,
leg restored.

| Leg | Check that failed |
|---|---|
| `playGuesses` returns the reveal mid-round (`reveal: over` → `reveal: true`) | `the answer is absent from every payload sent mid-round` |
| `evaluateGuess` returns `absent` for every letter | `a guess sharing a letter with the answer lights a tile` |
| The server never ends the round (`>= MAX_GUESSES` → `>= 99`) | all four new checks |
| Playwright's browsers removed from the cache | `no browser to drive`, with the install command named |

**The scoring leg survived the first pass, and the fix is the interesting part.**
With `evaluateGuess` returning `absent` for everything the board is uniformly
grey — and every tile still carries *a* result colour, so the check passed. The
tempting fix is to re-derive the expected colouring in the smoke script, which
would put a second copy of the scoring rules next to the first; this codebase
keeps refusing to do that and it is right to. The weaker invariant costs nothing
and needs no copy: **a guess that shares a letter with the answer must light
something.** Whether such a guess exists is checked rather than assumed, so it
is not luck, and it caught the leg.

**Measurements, with the command.**

`npm run verify`, undecorated, from start to finish — **for the first time this
session**, after you agreed to stop the `next dev` that had been holding Next's
one-per-project lock for 22 hours:

```
VERIFY_EXIT=0

typecheck       clean
lint            clean
test            # tests 249   # pass 249   # fail 0
build           ok
check:bundle    no answer ordering, coaching text or video ids  (36 files scanned)
check:size      164.9 kB total  (97% of the 170 kB budget)
check:contrast  every combination clears its bar
smoke           14 checks in dev, 14 in prod, all passed
```

Today's puzzle was 8 letters, and both modes played it out:

```
✓ a guess reaches the server and comes back scored
    rgb(75,85,99) rgb(75,85,99) rgb(234,179,8) rgb(75,85,99)
    rgb(234,179,8) rgb(234,179,8) rgb(234,179,8) rgb(75,85,99)
✓ a guess sharing a letter with the answer lights a tile   6/6 such row(s) lit
✓ the round plays to a finish                              6 guess(es), lost
✓ the answer is absent from every payload sent mid-round    9 payload(s) checked for "DEADLIFT"
✓ the result screen reveals the answer                      modal names DEADLIFT
```

`check:size` is unchanged for the sixth iteration running, which is expected:
nothing in this one ships to the browser.

**What I did NOT verify.**

- `npm run coach:probe` — still no `ANTHROPIC_API_KEY`. Untouched all session.
- `npm run build:extension` — untouched, unrun.
- The smoke round is played **signed out**, so it exercises the guess round trip,
  the hint schedule and the reveal, but not banking, the leaderboard, the AI
  quota, or the opening call. Those were verified live this session by direct
  API probes with throwaway accounts, not by the browser.
- The retry-until-it-lands typing is bounded at 40 attempts. I did not test what
  happens if the board is permanently stuck - it would report
  `the board stopped accepting input at "<word>"` rather than hang, which is the
  intent, but I have not forced that state.
- The four new checks add roughly one round of real gameplay per mode to
  `verify`. I did not measure how much wall-clock that costs.

**Found and not fixed.** Audit §6 (the extension asks for `https://*/*` and an
unused `"storage"`), §7 (`coach:probe` reports "n of 7" across 14 cases; the
guide's "safe by construction" claim covers the app's catalogue but not the
model's own knowledge of exercise names), §9 (fifteen wrong numbers and three
stale structural claims across README and DECISIONS), §10, and §12's remainder
(a streak need never break — the option you did not pick).

Two migrations remain pending on the live project, both reported by
`npm run cloud:check`: the `day_guesses` column and `fitdle_reset_progress`.

---

## Iteration 8 — the extension asked for every website, and its build had been broken for five iterations

**What I audited.** `extension/manifest.json`, `scripts/build-extension.mjs`,
the built `extension-dist/` output, `next.config.ts`, `tsconfig.json`, and
`.github/workflows/verify.yml`. Audit §6.

**The first thing I found was my own regression.** `npm run build:extension`
**failed**:

```
tests/openingCall.test.ts(133,42): error TS2307:
  Cannot find module '@/app/api/call/route'
```

The extension build parks `src/app/api` aside, because `output: 'export'`
refuses to build with a route handler in the tree. `next build` typechecks
whatever the tsconfig includes, so the route-level test I added in iteration 2 —
the one that made the opening-call fix possible at all — could not resolve, and
the build died on a file that is not part of the extension.

Five iterations, and nothing told me. The audit had already written down why:
*"the manifest is the one artefact `npm run verify` never touches"*. I wrote that
sentence and then shipped past it.

**What I changed.**

- `tsconfig.extension.json` (new) — the project config minus `tests`, used only
  by the extension build via Next 16's `typescript.tsconfigPath`. `npm run
  typecheck` still checks the tests in full, with the API present, which is
  where that check belongs.
- `package.json` — `build:extension` is now the fourth step of `verify`, before
  `build`. Order matters: it leaves `.next` holding the static export, and both
  `check:bundle` and `check:size` read the web build's output, so the web build
  has to come after it.
- `extension/manifest.json` — `"host_permissions": ["https://*/*"]` and
  `"permissions": ["storage"]` both removed.
- `scripts/build-extension.mjs` — derives `host_permissions` from
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SUPABASE_URL`, as origins; loads
  `.env.local` (it never did, so it was reading variables that were set and
  looked unset); warns loudly when there is no API url, because the extension
  then builds and installs perfectly and cannot play.
- `.github/workflows/verify.yml` — the Playwright install was incomplete.
- 3 new tests.

**Why the permissions were wrong, with the evidence.**

`grep -rc "chrome\." extension-dist --include='*.js'` finds exactly one hit, and
it is the word in the landing page's prose — *"without browser chrome"*. No
`chrome.*` API is called anywhere in `src/`, so `"storage"` bought nothing; the
app persists through `localStorage`, which needs no permission.

`https://*/*` grants host access to every site on the internet and Chrome
renders it to the user as "Read and change all your data on all websites". What
the popup needs is cross-origin `fetch` to two origins, both build-time
constants. Image hosts are deliberately not listed: `<img>` loads are governed by
the extension page's CSP, not by host permissions, so the YouTube thumbnails need
nothing, and video links open in a tab.

Measured, before and after, from the shipped `extension-dist/manifest.json`:

```
before   "permissions": ["storage"]
         "host_permissions": ["https://*/*"]

after    permissions:      key omitted entirely
         host_permissions: ["https://blqxcjfjqphiklktjhth.supabase.co/*"]

after, with NEXT_PUBLIC_API_URL=https://fitdle.example.com set:
         host_permissions: ["https://fitdle.example.com/*",
                            "https://blqxcjfjqphiklktjhth.supabase.co/*"]
```

**The CI workflow had the browser install wrong too**, and in a way that hides
the same gap the README had. It runs `npx playwright install --with-deps
chromium`. `chromium-headless-shell` is a **separate** download and is what
`chromium.launch()` reaches for by default. Measured locally with that exact
state:

```
launch FAILED with chromium only:
  Executable doesn't exist at .../chromium_headless_shell-1234/chrome-headless-shell
launch OK with the headless shell present
```

Both are now named in the CI step.

**Mutation table.**

| Leg removed | Test that failed |
|---|---|
| The broad host permission back in the committed manifest | `the committed manifest asks for no permissions at all` |
| The unused `"storage"` permission back | same test |
| The build stops deriving from `NEXT_PUBLIC_SUPABASE_URL` | `the build derives host permissions from where it actually talks` |
| A module starts calling `chrome.storage` | `nothing in the app calls a chrome.* API, so no permission is needed` |

All four caught on the first pass.

**Measurements, with the command.**

`npm run verify`, undecorated, with `build:extension` now inside it:

```
VERIFY_EXIT=0
VERIFY WALL CLOCK: 1:04.87

typecheck        clean
lint             clean
test             # tests 252   # pass 252   # fail 0
build:extension  4 page(s), 8 inline script(s) externalised
                 host permissions: https://blqxcjfjqphiklktjhth.supabase.co/*
build            ok
check:bundle     no answer ordering, coaching text or video ids  (36 files scanned)
check:size       164.9 kB total  (97% of the 170 kB budget)
check:contrast   every combination clears its bar
smoke            14 checks in dev, 14 in prod, all passed
```

Those 36 files are `16` from `.next/static` plus `20` from `extension-dist` —
so the answer-leak scan covers a **freshly built** extension now, rather than
whatever copy happened to be left from a previous run.

**What I did NOT verify.**

- **I have not loaded `extension-dist/` in Chrome.** The manifest is correct by
  construction and by test; whether Chrome accepts it, and whether the popup
  works against a real deployment, is unmeasured. There is no deployment to
  point it at from here.
- **The wall clock is a warm-cache number.** 1:04.87 was measured with Next's
  build cache populated, and I did not measure the before/after delta from
  adding `build:extension`, so I cannot say what that step costs on its own.
- The CI fix is reasoned from a local reproduction of the same command, not from
  a CI run. I cannot trigger one.
- `npm run coach:probe` — still no `ANTHROPIC_API_KEY`.

**Found and not fixed.** Audit §7 (`coach:probe` reports "n of 7" across 14
cases; the guide's "safe by construction" claim covers the app's catalogue but
not the model's own knowledge of exercise names), §9 (fifteen wrong numbers and
three stale structural claims), §10, and §12's remainder.

Two migrations still pending on the live project, both reported by
`npm run cloud:check`.

---

## Iteration 9 — a critical RCE advisory the security document said did not exist

**What I audited.** I started on §9 (the wrong numbers in the docs) and
re-measured every claim rather than trusting iteration 1's table. One of those
claims was SECURITY.md's *"`npm audit` reports **0 vulnerabilities** on Next
16.3.0"*. It does not:

```
3 vulnerabilities (2 high, 1 critical)

next    16.0.0 - 16.3.2   CRITICAL  Unauthenticated RCE on windows-hosted servers (CVSS 9.0)
                                    Unauthenticated RCE in the Image Optimization API (AVIF)
js-yaml 4.0.0 - 4.3.1     high      maxTotalMergeKeys does not limit CPU use
sharp   <0.35.4           high      libheif vulnerabilities
```

**What I chose, and why.** This displaced the rest of §9 immediately. A critical
advisory with a patch available outranks every remaining item, and it is the
purest example of the thing this repo keeps getting caught by: a true statement
that stopped being true while nobody touched the file. Advisories land *after*
you ship.

Worth being precise about the exposure: `package.json` already declared
`next: ^16.3.0`, so a fresh `npm install` would have picked up the fix. The
**lockfile** pinned 16.3.0, and `npm ci` — the command CI runs — installs from
the lockfile. So the vulnerable version was what actually got built.

**What I changed.**

- `npm audit fix` → Next 16.3.0 → **16.3.5**, plus `js-yaml` and `sharp`.
  10 packages changed; `package.json` needed no edit, only the lockfile.
- `package.json` — `check:audit` (`npm audit --audit-level=high`), now the
  fourth step of `verify`, after lint and before the tests.
- `SECURITY.md` — the "0 vulnerabilities" line replaced. It now names the
  command and what enforces it, records what was found, and says the old claim
  was false. A security document should not state a number that decays.
- `README.md` — the CI paragraph listed steps that no longer match `verify`.
- `scripts/coach-probe.mjs` — audit §7's reporting bug, below.

**Why moderate and low do not fail the build.** `--audit-level=high` is a
judgement, and the trade is real: an unrelated upstream advisory can now break
`verify` on a codebase nobody touched. That is the correct failure for high and
critical - the alternative is the state this repo was just in - but making a
moderate advisory in a transitive dev dependency stop the build would train
people to skip the step, which is worse than not having it.

**Also fixed: `coach:probe` reported "n of 7" across 14 cases.** `failures`
accumulates over both suites and was printed against `CASES.length`, so a run
where nine cases failed said "9 of 7 cases failed". The remediation text only
mentioned the coach, too, though half the cases are the guide's - and the two
have different fixes, since the guide's defence is structural (its prompt has
never seen the catalogue) rather than a matter of wording. Both corrected; the
header now says fourteen cases rather than seven.

**Mutation table.**

| Leg | What failed |
|---|---|
| The pre-patch lockfile restored | `npm run check:audit` → **exit 1**, naming the critical and two high advisories |
| The patched lockfile | `npm run check:audit` → exit 0 |
| `CASES.length` instead of the sum in coach-probe | total reported as 7 rather than 14 (checked by parsing the script, since the probe itself needs an API key) |

The audit leg is not a simulation: it is the repo's own state from before this
iteration, restored and re-measured.

**Measurements, with the command.**

```
npm audit                  before: 3 vulnerabilities (2 high, 1 critical)
                           after:  found 0 vulnerabilities
next                       16.3.0 -> 16.3.5
npm run check:audit        exit 1 on the old lockfile, exit 0 on the new one
```

`npm run verify`, undecorated, on the patched tree:

```
VERIFY_EXIT=0

typecheck        clean
lint             clean
check:audit      found 0 vulnerabilities
test             # tests 252   # pass 252   # fail 0
build:extension  host permissions: https://<project>.supabase.co/*
build            ok
check:bundle     clean  (36 files scanned)
check:size       165.4 kB total  (97% of the 170 kB budget)
check:contrast   every combination clears its bar
smoke            14 checks in dev, 14 in prod, all passed
```

**The upgrade's cost, measured:** first-load JS went **164.9 kB → 165.4 kB**,
+0.5 kB, still 97% of the budget. That is the only number in the repo that moved.

**What I did NOT verify.**

- **Whether this deployment was ever exposed.** One advisory is Windows-only and
  this is a Linux-targeted app; the other is the Image Optimization API with
  AVIF, which the web build does use (`next/image` on the landing page) but which
  I have not tried to exercise. There is no production deployment, so nobody was
  at risk in practice. I patched on the advisory, not on an exploit.
- **`npm run coach:probe`** — still no `ANTHROPIC_API_KEY`, so the corrected
  reporting has never actually printed. The arithmetic is checked by parsing the
  script.
- Whether `--audit-level=high` is the right line. It is a judgement, argued
  above, not a measurement.
- The Next patch notes. I read the installed 16.3.5's docs for the config option
  I used in iteration 8, but I did not diff 16.3.0 → 16.3.5 behaviourally beyond
  running `verify`.

**Found and not fixed.** §9's remaining numbers — and re-measuring them turned
up more than iteration 1 listed, including one claim that is not merely stale
but false as stated:

- README: *"`DEADLIFT` -> tap 'hamstrings' -> 1 candidate: DEADLIFT"*. Measured:
  **6** eight-letter catalogue words work the hamstrings (CRABWALK, DEADLIFT,
  HIPRAISE, INCHWORM, LEGPRESS, TOETOUCH). The worst case does exist, but it is
  SEATEDROW, not DEADLIFT.
- README: *"an average of 3.6 candidates out of 19+ same-length words"*. My
  measurement of the same idea — for each scheduled answer, average over the
  muscles it works of how many same-length catalogue entries work that muscle —
  gives **7.1**, tightest 1. I cannot reproduce 3.6; the method behind it is not
  recorded, so I cannot say which of us is measuring the right thing. Same-length
  pools are 19/21/18/23/18, so "19+" is wrong at 7 and 9 letters regardless.
- README: *"67 literal call sites"* of `text-white`/`text-slate-300`. Measured:
  **129**.
- Plus the fifteen already listed in the audit's §9 table, of which the test
  counts (93/200/106/159 → **252**), the chunk counts (43/48 → **36**) and the
  bundle size (178.0 → **165.4**) are now all re-measured on the current tree.

Also still open: audit §10, and §12's remainder.

---

## Iteration 10 — every documented number re-measured, and the one that moves pinned to the source

**What I audited.** Every figure in README.md, DECISIONS.md, SECURITY.md and the
load-bearing code comments, re-measured against the current tree rather than
trusting iteration 1's table. Audit §9.

**What I chose, and why.** It is what was left of the audit that a reader can
act on being wrong about. The extension, the guards and the criticals are done;
what remains besides this is §10's small stuff and §12's product decision.

**Three wrong numbers turned up that iteration 1 had not caught**, now written
up as audit §13:

- The README's most quotable claim — *"`DEADLIFT` → tap 'hamstrings' → 1
  candidate: DEADLIFT"* — is false. **Six** eight-letter catalogue words work the
  hamstrings: CRABWALK, DEADLIFT, HIPRAISE, INCHWORM, LEGPRESS, TOETOUCH. The
  worst case exists, but it is SEATEDROW → lats.
- The average beside it, *"3.6 candidates out of 19+"*: my measurement of the
  same idea gives **7.1**, and same-length pools run 18–23. I cannot reconcile
  3.6 because the method behind it was never recorded — so the replacement says
  how it was measured, which is the part that was missing. The same paragraph is
  duplicated verbatim in `MuscleDetail.tsx` and paraphrased in
  `tests/leaderboard.test.ts`; all three are fixed.
- *"67 literal call sites"* of `text-white`/`text-slate-300`: **129**.

**What I changed.** 14 corrections in README.md, 5 in DECISIONS.md, and 5 in
code comments and tests. Every one says the old figure was wrong rather than
quietly replacing it. Highlights beyond the counts:

- DECISIONS' preamble promised that *"every number here … can be reproduced with
  the command given"*. That was never true of the before/after pairs — the code
  that produced them is gone. It now distinguishes **live** figures (re-run
  2026-09-21) from **recorded** ones (historical, unreproducible), and the
  bundle table carries all three numbers with the label on each.
- DECISIONS §4 said `SCHEDULE_SIZE` was *"frozen at 60"*. The constant has read
  62 throughout and the README's own sweep table picked 62. `game.ts`'s comment
  said new words land at "index 60+"; they land at 62 and beyond.
- The README's security table pointed at `fitdle_server_time()` as what blocks a
  forward clock skip. `grep -rn fitdle_server_time` matched that one line and
  nothing else in the repo. What actually blocks it is that `/api/today`
  computes the seed server-side.
- The architecture table listed an `isAnswer` flag under the client column.
  `exercises.ts:15` says *"There is deliberately NO `isAnswer` flag"* and a test
  asserts its absence.

**The durable part.** Four different test counts across two documents (93, 200,
106, 159) is evidence that re-typing a number does not work, so the count is now
**pinned by a test**: it counts `test(` declarations across `tests/*.test.ts` and
asserts every `N tests` claim in the three documents equals it.

It failed the moment it was written — adding it made the count 253 while the
docs said 252 — which is the behaviour, not a mistake.

**The cost, stated plainly:** adding a test now means editing three lines of
documentation, and the failure names the new number so it is a one-character
fix. That is real friction, and it is the same trade as the size ratchet. I
judged four wrong counts to be worse. Everything else in that class is either
derived from the data at render time (the landing page already does this) or is
a historical figure that cannot be re-run and is now labelled as such — neither
needs pinning.

**Mutation table.**

| Leg | Test that failed |
|---|---|
| A test count drifts in README.md | `the documented test count is the real one` |
| A test count drifts in DECISIONS.md | same |
| The landing page hardcodes an exercise count | `the landing page derives its numbers instead of typing them` |

**The third leg survived the first pass**, and the reason is worth keeping. The
existing guard matched `\d{2,4}\s+exercises` — a number written next to the
word. Replacing `const EXERCISE_COUNT = CATALOGUE.length` with `= 100` renders
exactly the same wrong claim one level of indirection up, and sailed through.
The guard now also asserts that **no top-level constant in that file is a bare
number**, which is the real property: every figure the page states comes from
the data it imports.

**Measurements, with the command.**

| Claim | Was | Is | How |
|---|---|---|---|
| unit tests | 93 / 200 / 106 / 159 | **253** | `npm test` |
| client chunks scanned | 43 / 48 | **36** (16 web + 20 extension) | `npm run check:bundle` |
| first-load JS | 178.0 kB | **165.4 kB** | `npm run check:size` |
| answer pool | 60 (12 per length) | **62** (13/13/12/12/12) | node over `ANSWER_ORDER` |
| answers needing equipment | 25 | **26**, all with a substitute | node over `COACHING` |
| answers with a curated video | "40/40" | **60 of 62** | node over `COACHING` |
| candidates after tapping a lit muscle | 3.6 out of "19+" | **7.1**, pools 18–23 | node over `CATALOGUE` |
| 8-letter words working hamstrings | "1: DEADLIFT" | **6** | node over `CATALOGUE` |
| `text-white`/`text-slate-300` sites | 67 | **129** | `grep -roE` over `src/` |
| `SCHEDULE_SIZE` | "frozen at 60" | **62** | the constant |

`npm run verify`, undecorated: **exit 0**, all ten steps — typecheck, lint,
`check:audit` (0 vulnerabilities), 253 tests, extension build, web build,
`check:bundle` clean over 36 files, `check:size` 165.4 kB at 97% of budget,
`check:contrast` clean, smoke 14/14 in dev and 14/14 in prod.

**What I did NOT verify.**

- **The two recorded bundle figures (236.5 kB, 178.0 kB).** They cannot be
  re-run; the code that produced them is gone. They are now labelled as recorded
  rather than presented as reproducible.
- **DECISIONS §5's flip timings** (1.00 s → 0.80 s, 1.40 s → 1.10 s). Same
  category — a before/after against code that no longer exists. I did not
  re-derive the current durations from the stagger constants, so they are
  unchecked either way.
- **Whether 3.6 was ever right.** Its method was not recorded. I replaced it with
  a number whose method is stated; I cannot say the old one was measuring
  something wrong, only that it cannot be checked.
- `npm run coach:probe` — still no API key.
- Whether the built extension loads in Chrome.

**Found and not fixed.** Audit §10 (`practiceAnswer` is a dead field on the
session; `peekQuota` is called only from tests; a failed model call still
consumes the player's quota; `smoke` drops console errors whose text contains
"404"; the peek path reads process memory even when Redis is configured) and
§12's remainder (a streak need never break — the option you did not pick).

Two migrations still pending on the live project, both reported by
`npm run cloud:check`: the `day_guesses` column and `fitdle_reset_progress`.

---

## Iteration 11 — audit §10, the small things

**What I audited.** The five items in §10, re-read rather than taken from the
list: `GameSession.practiceAnswer`, `peekQuota`, the order of the quota claim
against the model call, `smoke`'s console-error filter, and `counter.ts`'s peek
path.

**What I chose, and why.** Only one of the five has any effect on a player, and
it turned out to be worth more than "small": **a deployment with no Anthropic
key charged every question against the player's daily allowance and answered
none of them.** `askCoach` and `askGuide` check for the key and return "not set
up on this deployment" without making a request — but the routes claimed the
quota before reaching them. On the free tier that is five questions a day spent
on nothing. Nobody reports that; it reads as the feature being bad.

I fixed the three cheap ones alongside it because they are the same surface and
a few lines each, and left the fifth alone — `counter.ts` serving a peek from
process memory even when Redis is configured is documented, deliberate, and
costs only a cosmetic number.

**What I changed.**

- `src/server/aiBudget.ts` — `aiConfigured()`, one place that knows whether a
  model call is possible. It lives beside the budget rather than in either
  surface because both ask the same question of the same variable, and because
  the answer has to reach the *routes*, which is the whole point.
- Both AI routes — claim when configured, **peek** when not, and never refuse on
  a quota that was never spent. `peekQuota` had been exported and called only
  from its own test; it has a caller now.
- `src/server/session.ts` — `practiceAnswer` removed. Declared, never written,
  never read, and the one field `openSession` did not validate: a dead field was
  the only unvalidated thing in a signed token.
- `scripts/smoke.mjs` — the console-error filter was `!/404/.test(t)`, which
  drops *any* error whose text contains "404", including a real one that
  mentions a status code in passing. It now forgives the browser's own
  resource-load failure and nothing else.
- README — the free-tier section says what changed and why it was worth saying.
- 4 new tests.

**Mutation table.**

| Leg removed | Test that failed |
|---|---|
| The coach route claims unconditionally again | `both routes gate the claim on there being a key at all` |
| The guide route refuses on a quota it never spent | same |
| `aiConfigured()` accepts an empty key | `with no API key, asking a question costs nothing` |
| `practiceAnswer` back on the session | `the session carries nothing it does not use` |

All four caught on the first pass.

**Measurements, with the command.**

`npm run verify`, undecorated: **exit 0** — typecheck clean, lint clean,
`check:audit` 0 vulnerabilities, **257 tests** (was 253), extension build, web
build, `check:bundle` clean over 36 files, `check:size` 165.4 kB at 97% of the
170 kB budget, `check:contrast` clean, smoke 14/14 in dev and 14/14 in prod.

The documented count needed updating twice this iteration, which is the pinning
test doing its job — it names the new number each time.

**Narrowing the smoke filter changed nothing**, which is the answer I wanted:
`npm run smoke -- prod` still reports `no console errors`, so there were no
genuine 404s being forgiven. The exemption was covering nothing and could have
hidden something.

**What I did NOT verify.**

- **The keyless path end to end.** The tests exercise `aiConfigured()` and the
  quota functions directly and assert the route's shape; I did not drive
  `/api/coach` with no key and watch the counter stay put, because the route
  needs a finished round and a verified user to be interesting. The unit-level
  evidence plus the mutation table is what stands behind it.
- **Whether a mid-call failure should refund the allowance.** It still consumes.
  Refunding would need `fitdle_claim_ai` to decrement — another migration — and
  it is genuinely ambiguous: an exception after the request was sent may already
  have been billed by Anthropic. The no-key case is unambiguous and is the one I
  fixed. Left as-is deliberately.
- `npm run coach:probe` — still no API key. That is now the only item in the
  original audit that has never been exercised at all.

**Found and not fixed.** Audit §12's remainder — a streak need never break,
because a player five guesses deep can discard rather than submit the sixth.
That is the option you did not pick, and closing it changes what happens to
somebody who clears their browser mid-round.

Two migrations still pending on the live project, both reported by
`npm run cloud:check`: the `day_guesses` column and `fitdle_reset_progress`.

---

## Iteration 12 — one map, three period scales, and a spend cap that reset itself

**What I audited.** My own work, first: whether the `day.spent` field added in
iteration 3 can make a valid save fail coherence, which is the bug class that
once silently wiped streaks here. It cannot — `spent` is written only by the
server at round end, after which no more guesses are accepted, so
`guesses.length` can never overtake it. I did find that
`useGameStore` rebuilds `day` locally and drops the server's `spent`
(`next = { ...d.progress, day }`), so the local record disagrees with the
server's. The leaderboard reads the server row, so it is cosmetic, and I left it.

Then the parts iteration 1 never read: `memoryCounter`, the backup-code and
legacy-migration paths in `secureStorage`, and the store's day handling.

**What I found, and it is the worst thing in this session.** `memoryCounter`
keys every counter by a `window` id whose meaning depends on the caller, and
three periods are live at once — day (~20,717), seed (~20,260,921), minute
(~29,833,266). The sweep compared them to each other, so a sweep triggered by a
rate-limit call deleted every day-scoped and seed-scoped bucket, live ones
included. Measured, before the fix:

```
window scales in one shared map:
  utcDay (AI budget, anon quota) : 20717
  seed   (the guess floor)       : 20260921
  minute (every rate limit)      : 29833266

budget:coach used -> 3
after 5100 rate-limited requests from distinct addresses:
  budget:coach used -> 0
```

`aiBudget.ts`'s own comment says it exists because *"1,000 players asking three
questions each is entirely within every per-IP limit and still an unbounded
bill"*. The condition that produces such a day — thousands of distinct addresses
— is precisely the condition that emptied the counter guarding against it, and
the sweep threshold is the same order of magnitude. The one path in this app
that costs real money, and its guard reset itself under exactly the load it was
built for.

It takes the anonymous AI allowance with it, and since iteration 3 the guess
floor that keeps the daily leaderboard honest.

**Not my regression, and worth being precise about that.** The collision dates
from the refactor that merged three `Map`s into one — the same change the README
holds up as an improvement ("Everything that counts, counts in one place"). It
was right about the duplication and did not notice that the three counters'
window ids had stopped being comparable. Iteration 3 added a third scale to an
already-broken comparison.

**What I changed.** The sweep drops buckets by **wall-clock expiry** instead of
by window id. `resetsIn` is already passed by every caller and already means
"seconds until this bucket rolls", so an absolute expiry needs no new argument
and is comparable across every period. Lazy expiry on read still does the
counting; the sweep is only about reclaiming memory. Recomputed on every write
from the caller's current `resetsIn`, which counts down to a fixed boundary — so
it converges on it rather than being pushed out, which is the mistake the Redis
script already documents.

**Mutation table.**

| Leg | Test that failed |
|---|---|
| The sweep goes back to comparing window ids | `rate-limit traffic cannot wipe the day’s AI budget` |
| The sweep stops reclaiming anything | same test |

One test, two assertions, because the sweep throttles to once a minute and a
test run therefore gets exactly one sweep: the live day-scoped counter must
survive the flood, and a bucket that expired immediately must be gone. Without
the second half the fix could have been "never delete anything", which trades a
correctness bug for a memory leak.

**Measurements, with the command.**

```
before   budget:coach used -> 3, then 0 after 5,100 rate-limited requests
after    budget:coach used -> 3, then 3
```

`npm run verify`, undecorated: **exit 0** — typecheck, lint, `check:audit` 0
vulnerabilities, **258 tests**, extension build, web build, `check:bundle` clean
over 36 files, `check:size` 165.4 kB at 97% of budget, `check:contrast` clean,
smoke 14/14 in dev and 14/14 in prod.

**What I did NOT verify.**

- **The Redis path is unaffected, by reading rather than by running.** With
  Upstash configured the consuming path goes to `sharedCount` and never touches
  this map, so the bug only ever bit the default, unconfigured deployment — which
  is the one every fresh clone runs. No Redis is configured here, so that is
  reasoning, not a measurement.
- **The real-world threshold.** 5,100 keys is what trips `SWEEP_ABOVE` in a test;
  I have not modelled how quickly a live deployment reaches 5,000 distinct
  counter keys, only that the sweep is the mechanism and distinct addresses are
  the input.
- **`useGameStore` dropping the server's `day.spent` locally.** Identified, read,
  judged cosmetic, not fixed and not tested.
- The legacy-migration path in `secureStorage` sets `played = wins = streak` and
  leaves `lastSeed` null, so a migrated streak has no anchor and `reconcile`
  never breaks it. One-time, client-side, and the cloud streak is server-owned,
  so I left it. Noted here because I read it and did not act.
- `npm run coach:probe` — still no API key.

**Found and not fixed.** Audit §12's remainder (a streak need never break — your
decision), and the two items above that I read and deliberately left.

Two migrations still pending on the live project, both reported by
`npm run cloud:check`.

---

## Iteration 13 — practice mode and the drill had no browser coverage at all

**What I audited.** The two client-only modes, because everything server-side is
now covered and a bug in either is invisible to every test in the repo. Started
from a claim I doubted: the README and `useGameStore` both said practice *"picks
locally from the answer-eligible pool"* — which would mean the client knows
which 62 of the 99 can be answers, the exact leak that deleting `isAnswer`
closed.

**It does not.** `PRACTICE_POOL = CATALOGUE`, and the definition site says so
clearly. Only `startPractice`'s own comment had the wrong wording, and it is
corrected. No leak.

Then I drove both modes in a browser, which nothing had done:

```
practice: 6 cols, guessed PULLUP
  row scored: rgb(75,85,99) rgb(234,179,8) rgb(75,85,99) rgb(75,85,99)
  /api calls during the whole practice round: NONE

the drill:
  options: ["Lats","Glutes","Abs"]
console errors: none
```

Both healthy. The finding is not that they are broken — it is that **nothing
would have told anyone if they were**. Two README claims rest on them:

- *"Practice mode stays fully local"* — no round trip per guess.
- *"They are never written to storage, so there is no path from a practice round
  to a streak."*

Both are properties of the running client. `npm test` covers the drill's
question generator and asserts the embedded drill's *imports*; neither claim had
a check that could fail.

**What I chose, and why.** Adding that coverage. It is the other half of audit
§5 — iteration 7 made the smoke test play the daily round, and the two modes
beside it stayed untouched. The harness was already written, so this is three
checks for very little.

**What I changed.** `scripts/smoke.mjs` only, plus the one wrong comment.

- `the embedded drill starts and offers answers` — clicked on the landing page,
  where it is the single interactive island on a server component.
- `practice scores locally, with no server call` — starts practice after the
  daily round, plays one real guess from the in-app list, and counts `/api`
  requests across the whole round.
- `a practice round cannot reach the streak` — snapshots `localStorage` before
  and after.

Also: the result-modal read had to move **above** the Escape that clears it for
practice, and its failure message said `modal names <answer>` whether it passed
or failed. Both fixed — the second only surfaced because the reordering made the
check fail for real, and the message still claimed success.

**Mutation table.**

| Leg | Check that failed |
|---|---|
| `startPractice` writes the save | `a practice round cannot reach the streak` — "it wrote the save" |
| The practice branch falls through to the server path | `practice scores locally, with no server call` — "1 API call(s)" |

**The second leg's first attempt did not apply** — my `sed` matched nothing and
the run passed, which would have read as "the check is hollow" if I had not
checked that the mutation landed. It did once aimed at the right line. Worth
recording: a mutation that silently fails to apply looks exactly like a test
that cannot fail.

**Measurements, with the command.**

`npm run verify`, undecorated: **exit 0** — typecheck, lint, `check:audit` 0
vulnerabilities, 258 tests, extension build, web build, `check:bundle` clean
over 36 files, `check:size` 165.4 kB at 97% of budget, `check:contrast` clean,
and smoke now **17 checks in each of dev and prod** (was 14).

**What I did NOT verify.**

- **The drill check is shallow.** It asserts the drill starts and offers at
  least three options beside a figure. It does not answer a question, score one,
  or check the personal best — so a drill that renders and then scores
  everything wrong would still pass.
- **The practice check plays one guess, not a round.** Enough to prove local
  scoring and that storage is untouched; it does not play to a win, so the
  practice result screen is uncovered.
- **Practice's pick is uniform over the catalogue** — I read that and did not
  measure the distribution.
- The legacy-save migration path and `useGameStore` dropping the server's
  `day.spent`, both from iteration 12's audit: still read, judged, not fixed.
- `npm run coach:probe` — still no API key.

**Found and not fixed.** Audit §12's remainder (your decision), and the two
items above.

Two migrations still pending on the live project, both reported by
`npm run cloud:check`.

---

## Iteration 14 — a dark flash on every load, and a landing page that ignored the theme

**What I audited.** The client, which iteration 1 covered thinly: every
component, both remaining stores, and the scripts. Scanned first for the defect
classes this repo has actually been bitten by — module-scope `new Date()`, a
Zustand selector building a fresh object without `useShallow`, unguarded
`localStorage`, timers without cleanup, `dangerouslySetInnerHTML`. All clean;
the `useShallow` discipline is applied at all three call sites that need it.

Then `useSettingsStore`, which is where it stopped being clean. It applies the
theme from `load()`, called in a `useEffect` — which runs after hydration.

**Two defects, both measured in a browser.**

```
BEFORE
/play  DOMContentLoaded : theme=null      body=rgb(10, 14, 24)   (main opacity 0)
/play  hydrated         : theme=daylight  body=rgb(245, 247, 250)
/play  FLASH            : YES

/      DOMContentLoaded : theme=null      body=rgb(10, 14, 24)
/      hydrated         : theme=null      body=rgb(10, 14, 24)
```

1. **A full dark-to-light flash on every single load** for anyone on Daylight.
   Not a subtle flicker — near-black to near-white, every page, every time.
2. **The landing page never applied the theme at all.** It is a server component
   with no settings store, so `/` stayed dark whatever the player had chosen
   while `/play` was light. The README calls Daylight "a genuine light mode"; on
   the page that owns `/`, it was not applied.

This is the shape DECISIONS already has a section about — `body { overflow:
hidden }` outliving the assumption that there was only one screen. The theme was
wired into the game, and then a second page appeared.

**What I changed.** `public/theme.js` — a ~400-byte blocking script in the root
layout that reads the one settings key and stamps the attributes before the
browser paints. Being in the root layout, it fixes both at once.

A file rather than an inline script, deliberately: the CSP allows inline
(`'unsafe-inline'`, documented as the weak directive), but there is no
`dangerouslySetInnerHTML` anywhere in this codebase and this is not the reason
to add the first one. A same-origin file also satisfies MV3's stricter
`script-src 'self'`, so the extension build gets the fix for free — and, as a
side effect, `check:bundle` now scans 37 files instead of 36, because the script
is copied into `extension-dist` and swept for answer data like everything else.

`next/script` cannot do this job: every strategy it offers, `beforeInteractive`
included, is documented as **not** blocking. I read that before writing the code
rather than after.

**Measured after:**

```
/play  DOMContentLoaded : theme=daylight  body=rgb(245, 247, 250)  (main opacity 0)
/      DOMContentLoaded : theme=daylight  body=rgb(245, 247, 250)
FLASH  : no, on either
```

`main opacity 0` is the proof it is pre-hydration.

**Mutation table.**

| Leg | What failed |
|---|---|
| The script removed from the layout | unit: `the theme script blocks, or it is not a fix`; smoke: both theme checks, `/play null, / null` |
| The script marked `defer` | unit: `the theme script blocks, or it is not a fix`; smoke: `the theme script is served blocking, not deferred` |
| `theme.js` drops a theme from its list | unit: `the theme is stamped before paint, from one list of themes` |

**The `defer` leg initially passed both smoke checks**, and that is worth
keeping. Reading at `DOMContentLoaded` cannot distinguish a blocking script from
a deferred one — deferred scripts have already run by then — so `defer`
reintroduced the flash while the behavioural checks stayed green. Only the
source assertion caught it. I added a third smoke check that inspects the
`<script>` element the server actually sent (`!tag.defer && !tag.async`), which
closes it at the DOM level rather than at the source level.

**A mistake of my own, recorded because it nearly shipped.** I ran
`npx tsc --noEmit && npx eslint 2>&1 | head -5` and moved on. `head -5` cut off
the error: `@next/next/no-sync-scripts` rejects a synchronous script, and
`verify` failed on lint two steps later. Truncating the output of a check is how
you turn a red build into a green-looking one. The rule now carries a targeted
disable with the reason written next to it, and a test pins that the script
stays blocking so the disable cannot quietly become wrong.

**Measurements, with the command.**

`npm run verify`, undecorated: **exit 0** — typecheck, lint, `check:audit` 0
vulnerabilities, **260 tests**, extension build, web build, `check:bundle` clean
over **37 files**, `check:size` 165.4 kB at 97% of the 170 kB budget,
`check:contrast` clean, and smoke **21 checks in each of dev and prod** (was 17).

`check:size` is unchanged again: `theme.js` is a static file, not part of the
first-load JS the ratchet measures.

**What I did NOT verify.**

- **That there is no flash at the actual first paint**, as opposed to at
  DOMContentLoaded. A blocking script in `<head>` runs before the parser reaches
  `<body>`, so the browser cannot paint a wrong background — but I measured the
  attribute and the computed style at DOMContentLoaded, not a frame capture.
- **The extension popup.** The fix should reach it (same static file, same
  root-relative path, allowed by MV3's CSP) and `build:extension` succeeds, but I
  have still never loaded `extension-dist/` in Chrome.
- **Colourblind and reduced-motion** are stamped by the same script and are
  covered by the list test, but neither is asserted in the browser — only
  `data-theme` is.
- The other four items from the scan (timers, selectors, storage guards,
  module-scope dates) were read and found clean; "clean" there means I read them,
  not that anything exercises them.
- `npm run coach:probe` — still no API key.

**Found and not fixed.** Audit §12's remainder (your decision), plus the two
items carried from iteration 12: the legacy-save migration leaves a migrated
streak with no `lastSeed` anchor, and `useGameStore` drops the server's
`day.spent` when adopting the banked record.

---

## Iteration 15 — a full functional recheck, at your request

**What I did.** Re-walked every documented behaviour of the game against a
running server and the live database, rather than picking an item to build. Four
passes: the pipeline, the HTTP API, the signed-in cloud path, and the UI
surfaces the smoke test does not reach.

**Results.**

| Pass | Result |
|---|---|
| `npm run verify`, undecorated | **exit 0** — 260 tests, 0 vulnerabilities, 37 chunks scanned, 165.4 kB at 97% of budget, contrast clean, 21 browser checks in each mode |
| API walk — 52 assertions over every route and rule | **52 passed** |
| Cloud walk — 30 assertions over banking, boards, floor, RLS, quota, reset | **30 passed** |
| UI walk — menus, settings, countdown, drill, share, muscle map | 1 real defect, below |
| `npm run cloud:check` | green except the two known pending migrations |

The API walk covers: fresh board shape, token resume, stale and tampered tokens
discarded, lowercase input, scoring, all four rejection reasons, the hint
schedule at guesses 3 and 5 with `nextHintIn` counting down, muscle
shared/missed disjointness, unprobed muscles staying dark, the reveal arriving
only at the end, injected `status`/`progress` ignored, a finished board refusing
extension, all nine opening-call rules, the three coach 403 gates, the guide
being ungated, and both leaderboards returning uncached and id-free.

The cloud walk creates throwaway accounts, plays real rounds through the real
routes, and deletes everything in a `finally` — `cleanup: 3 throwaway
account(s) removed`. It confirms banking, the denormalised username, board
membership with a server-side `isYou`, the guess floor (five wrong, discard,
win in one → **banked as six**, `distribution [0,0,0,0,0,1]`), all four forgery
attempts refused as the row's own owner, the free tier allowing exactly five AI
messages (`yyyyynn`), pro lifting it, a new day reading as unused, and the
reset's delete path.

**The one real defect: a README claim the code had outgrown.**

> **Tap any muscle** on the figure. During the round it names the muscle and
> stops; the exercise lists unlock when the round ends.

Measured: mid-round `svg [role="button"]` is **0** — the regions carry no click
handler, no role and no label at all. After the round it is **34**, each
labelled `"<Muscle> - show what else trains it"`. `Game.tsx` passes
`onSelectRegion` only when `roundOver`, and its own comment says so. The code is
*stricter* than the README described, so the README is what was wrong.

Corrected in place, and pinned by two new smoke checks — the difference is
invisible to everything else in the repo.

| Leg | Check that failed |
|---|---|
| The figure becomes tappable mid-round | `the muscle figure is not tappable mid-round` — "17 tappable region(s) while playing" |

**Five probe errors of my own, all corrected, none of them app defects.** Worth
recording because each one first looked like a failure:

1. The hint schedule. I asserted the category hint arrives *after* the 3rd
   guess; `CATEGORY_HINT_AT = 3` means it is there **for** guess 3, once two are
   spent — which is what the README says and what the unit test pins
   (`nextHintIn === 2` from an empty board).
2. `streak === 0` after the forgery attempts. The probe account had legitimately
   won, so 1 was correct; the assertion now compares against the pre-attack
   value and that the forged 9999 did not take.
3. Finishing a round with an out-of-band `fetch` from inside the page, which
   never updates the client's save, so the reload restarted the round.
4. `buildShareText`'s signature — seven positional arguments, not an object.
5. Two text regexes that missed ("Rep completed", not "Solved") and a
   `split('\n\n')` that counted the streak line as a grid row.

**Measurements, with the command.** `npm run verify` after the change: exit 0,
260 tests, 0 vulnerabilities, 37 files scanned, 165.4 kB at 97%, contrast clean,
and smoke **23 checks in each of dev and prod** (was 21).

Share text, printed verbatim during the walk:

```
Fitdle #267 2/6

⬛⬛⬛⬛⬛⬛
🟩🟩🟩🟩🟩🟩
🔥 3 day streak

https://fitdle.app
```

with 🟩 → 🟦 under colourblind mode, the drill badge on its own line, and the
answer name absent.

**What I did NOT verify.**

- **`npm run coach:probe`** — still no `ANTHROPIC_API_KEY`. The coach answered
  "The coach is not set up on this deployment" through the gate, which proves the
  gate and the degradation, not the model's behaviour.
- **The two pending migrations.** The walk confirms the *current* deployed
  schema: `day_guesses` still ranks the guess array (1, where `save.day.spent`
  is 6), and `fitdle_reset_progress` is absent so the reset uses the delete
  fallback. Both are reported by `cloud:check` and both are yours to apply.
- **The extension popup in Chrome** — still never loaded.
- **The account modal and backup-code round trip** — I opened the menu surfaces
  and confirmed each renders, but did not export a code, clear storage and
  import it.
- **Today's shortlist panel** and the stats modal's numbers after a played round
  — opened and rendered, contents not asserted.
- **Reduced motion** — the attribute is stamped by the same code path as
  colourblind, which I did toggle, but I did not assert that animations shorten.

---

## Iteration 16 — fix everything outstanding

**What I audited.** Every item still open: the two Supabase migrations, the
never-breaking streak, the three small things I had read and left, and the
extension popup I had never loaded.

**The one thing I could not fix, and why.** The two migrations need DDL against
your database and there is no path to it from here:

```
rpc exec_sql / execute_sql / sql / query / exec  ->  PGRST202, none exist
.env.local / .env.example                        ->  no connection string, no DB password
psql, supabase CLI                               ->  not installed
```

PostgREST exposes no SQL execution, and the service-role key is not a Postgres
password. They have to be run from the Supabase dashboard's SQL Editor. Both are
reported by `npm run cloud:check`.

---

### 1. A streak could never break — closed

The hole: the session is the server's only memory of a round and the client
decides whether to send it, so a player five guesses deep and wrong simply
never submitted the sixth, discarded, and played the day again.

You chose the guess floor over the stricter "closed day" in iteration 3, on the
grounds that a closed day could strand someone who cleared their browser
mid-round. That objection is answerable: the floor already counts, so the day
can end at six **and** still hand over the reveal, which is exactly what the
player would have got had they not cleared anything. And it is per verified
account, so nobody behind a shared address is affected at all.

`playGuesses` takes an optional `spent`, defaulting to `guesses.length` - the
old behaviour for every caller that does not know better, anonymous play
included. Both board-building routes pass it.

Measured live, signed in:

```
three guesses, one session : status=playing board=3
discard the token          : status=playing board=0
three more on the new board: status=lost    board=3  reveal=CRUNCH
discard again and reopen   : status=lost    board=0  reveal=CRUNCH
a seventh guess (the answer) -> REFUSED: finished
banked: streak=0 lastResult=lost spent=6

an honest round is untouched: 3 guesses, resume with the token, win in 4
anonymous: five guesses then reopen -> playing, board 0   (unchanged, by design)
```

| Leg removed | Test that failed |
|---|---|
| `playGuesses` ignores the floor | `a day ends at six guesses even when the board shows fewer` |
| The floor counts anonymous callers too | `the floor is per account, and anonymous callers have none` |
| `guessesSpent` claims instead of peeking | same |
| `/api/today` stops consulting the floor | `both board-building routes consult the floor` |

---

### 2. The extension popup was a dead page, and always had been

I had never loaded it. Loaded into a real Chromium with `--load-extension`, it
came up at `opacity: 0` - React never hydrated. No console output, no failed
requests, no CSP violations.

Bisected against the raw export, served over plain HTTP:

```
out/ untouched                     hydrates   (opacity 1)
rename + rewrite, inline kept      DEAD       (opacity 0)
inline hoisted, paths untouched    hydrates   (opacity 1)
```

So the inline hoisting - the part MV3 genuinely requires - was fine, and the
`_next` → `next-assets` rename was the cause. The rewrite only touched the
HTML, so the chunk paths inside the RSC payload became `next-assets/...` while
the runtime's own manifest, baked into the JavaScript, still said `/_next/...`.
React waited for a chunk it already had under another name. Silently, forever.

**The premise was false.** The rename existed because "Chrome refuses to load
resources from directories whose name starts with an underscore". An extension
built with `_next` intact loads and serves every resource under it - verified by
loading one. So the fix is to delete the rename and the rewrite entirely;
`/_next/...` is absolute and resolves to `chrome-extension://<id>/_next/...`,
which is correct.

The old verification was *"0 inline scripts, 0 `_next` references"* - a property
of the files, not of the popup.

`npm run smoke` now loads the built extension into Chromium and drives the
popup. It is configuration-aware, because a static export can only play if the
build was given a server:

```
configured (NEXT_PUBLIC_API_URL set)   7 columns, typing works, no errors
unconfigured (what verify builds)      says "Cannot reach the server", offers retry
```

Both branches were exercised; the configured one needed the web build and the
server started *before* `build:extension`, because that command overwrites
`.next`.

| Leg | Check that failed |
|---|---|
| The `_next` rename and rewrite come back | `the popup hydrates (main is visible)` — opacity 0 |

---

### 3. Two defects the extension work uncovered

Running the unconfigured popup showed a normal-looking board that would not
accept a letter, and **"Puzzle #-46052"**.

- **The only sign of an unreachable server was a toast that clears itself after
  2.2 seconds.** After that the player is looking at an ordinary game with a
  dead keyboard. There is now a persistent banner with a retry, in the same
  shape as the existing clock-rollback bar.
- **`getPuzzleNumber(0)` rendered a negative puzzle number.** The sidebar gated
  on `hydrated`, and the offline path sets `hydrated: true` while the seed is
  still 0. It gates on a real seed now.

Both are asserted by the unconfigured branch of the extension check.

---

### 4. The three small things carried from earlier iterations

- **The client dropped the server's `day.spent`** when adopting the banked
  record. Fixed; pinned by `the client keeps the server’s spent when it adopts
  the banked record`, which survived its first mutation pass and now has a test.
- **A migrated legacy streak could never break.** The migration left `lastSeed`
  null, so `reconcile`'s gap check never ran. Anchored to **yesterday** - not
  today, because `commitResult` refuses to pay out twice for one seed and
  anchoring to today would have swallowed today's win. Driven through `loadSave`
  with the real legacy key, because `migrateLegacy` is not exported and a test
  that imports a name which does not exist passes for the wrong reason - my
  first attempt did exactly that and I threw it away.
- **A failed model call still consumes the player's quota.** Left, deliberately:
  refunding needs `fitdle_claim_ai` to decrement, which is another migration,
  and an exception after the request was sent may already have been billed. The
  unambiguous case - no key configured - was fixed in iteration 11.

---

**Measurements.** `npm run verify`, undecorated: **exit 0** — typecheck, lint,
`check:audit` 0 vulnerabilities, **268 tests**, extension build, web build,
`check:bundle` clean over 37 files, `check:size` 165.4 kB at 97% of the 170 kB
budget, `check:contrast` clean, and smoke **23 checks in dev, 23 in prod, 9 in
the extension**.

**What I did NOT verify.**

- **The two migrations.** Unreachable from here, as shown above.
- **`npm run coach:probe`** — still no `ANTHROPIC_API_KEY`. Unchanged all
  session; the model's behaviour remains the one thing never exercised.
- **The extension check needs `channel: 'chromium'` and a persistent profile.**
  It works here and CI installs that channel, but I have not seen it run in CI.
- **Whether the guess cap behaves across a UTC midnight**, when the seed changes
  and the counter key changes with it. The key includes the seed, so it should
  reset cleanly; I did not wait out a rollover to watch it.
- **The offline banner in the web app** — asserted in the extension popup, which
  is the same component, but not driven in dev or prod where the server is up.
