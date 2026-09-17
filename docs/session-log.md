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
