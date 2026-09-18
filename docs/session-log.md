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
