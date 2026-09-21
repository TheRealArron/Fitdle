# Security posture

## Enforced

| | How |
|---|---|
| Answer not in the client bundle | `server-only` on the schedule + `check:bundle` greps compiled chunks |
| Wins can't be forged | Server derives status from an HMAC-signed session it issued |
| Streaks can't be forged | Client `insert`/`update` revoked; API writes under service-role. **Verified live** - signed in as the row's own owner, UPDATE touches 0 rows and INSERT/UPSERT return 42501 |
| Guess counts can't be forged | Counted per account per UTC day by the server, not read off the client's session token |
| Identity can't be spoofed | `auth.getUser()` verifies the JWT; `sub` is never read locally |
| No user ids on the leaderboard | `isYou` computed server-side, crosses as a boolean |
| Secrets stay server-side | Tests assert no `NEXT_PUBLIC_` on service-role or Anthropic keys |
| Sweeping the opening call for a free hint | First call per caller per day is recorded server-side; a second group is refused without an outcome |
| AI spend bounded | Per-account quota (durable) + global daily cap + rate limits |
| XSS | No `dangerouslySetInnerHTML`, no `eval`; CSP, HSTS, nosniff, frame-deny |

## Known and accepted

**Dependency advisories are checked by `verify`, not asserted here.**

This file used to say *"`npm audit` reports 0 vulnerabilities on Next 16.3.0"*.
That was true when it was written and had since stopped being true, which is the
problem with writing a number down: advisories land after you ship, so a
security document that states one decays into a false claim without anyone
touching it. Measured on 2026-09-21, on Next 16.3.0:

```
3 vulnerabilities (2 high, 1 critical)

next    16.0.0 - 16.3.2   CRITICAL  Unauthenticated RCE on windows-hosted servers (CVSS 9.0)
                                    Unauthenticated RCE in the Image Optimization API (AVIF)
js-yaml 4.0.0 - 4.3.1     high      maxTotalMergeKeys does not limit CPU use
sharp   <0.35.4           high      libheif vulnerabilities
```

`package.json` already allowed the fix (`next: ^16.3.0`), so a fresh
`npm install` was fine and a fresh `npm ci` — the one CI runs — reinstalled the
vulnerable version from the lockfile. Patched to Next 16.3.5; `npm audit` now
reports 0, first-load JS moved 164.9 kB → 165.4 kB, and `npm run verify` passes
end to end on it.

`npm run check:audit` (`npm audit --audit-level=high`) is now the fourth step of
`verify`, so the claim enforces itself rather than being restated. Verified
against the real before-and-after: exit 1 on the pre-patch lockfile, exit 0 on
the current one. Moderate and low advisories do not fail the build; high and
critical do.

**In-process counters.** Rate limits, the global AI budget and the anonymous
quota count per instance, so they multiply across instances and reset on cold
start. Speed bumps, not guarantees. The signed-in AI quota is in Postgres
because it guards money. See `src/server/memoryCounter.ts`.

They were worse than that until 2026-09-21. One map holds all of them, and the
window id it keys them by means different things per caller — a day number
(~20,717), a `YYYYMMDD` seed (~20,260,921), a minute (~29,833,266). The sweep
compared those ids to each other, so a sweep triggered by a rate-limit call
deleted every day-scoped and seed-scoped bucket, live ones included. Measured:
spend 3 of the day's AI budget, make 5,100 rate-limited requests from distinct
addresses, and the budget reads **0 used** — the global spend cap reset by
exactly the traffic it exists to survive. It sweeps by wall-clock expiry now,
which is comparable across every period, and a test pins it.

**Anonymous AI quota is resettable.** Keyed by IP in memory. Enforcing it
properly means fingerprinting, which is a worse trade for 2 questions.

**The opening-call record is keyed by address for anonymous players.** Rotating
addresses buys fresh calls, exactly as it buys fresh rate-limit windows, and
without Redis the record is per instance. It closes the sweep; it does not make
the call unforgeable. Signed-in players are keyed by their verified id.

**Signed-out local saves are editable.** They are the player's own file and
nothing reads them but that browser. Cloud streaks are server-written.

## Not verified

Both model guardrails need an API key: run `npm run coach:probe` after
deploying, before announcing.

The RLS revocation **is** now verified against a live project - as the row's own
owner, with the public anon key: UPDATE 0 rows, INSERT and UPSERT 42501, the
`fitdle_claim_ai` RPC 42501, DELETE one row, and the streak column unmoved.
Note that `cloud:check` is not what verified it: its probe is an unauthenticated
caller updating a row that does not exist, which the *old* policy would have
passed identically. Proving the revocation needs an authenticated owner updating
their own existing row.

Still outstanding, and both are player-facing rather than security:

- A streak need never break. The signed session is the server's only memory of a
  round and the client chooses whether to send it, so a player five guesses deep
  and wrong can discard rather than submit the sixth. The guesses are counted, so
  the leaderboard is honest; the round simply never ends.
- Rate limits, the global AI budget, the anonymous quota and the opening-call
  record are per instance without Redis, and keyed by address for anonymous
  callers. Speed bumps.
