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
