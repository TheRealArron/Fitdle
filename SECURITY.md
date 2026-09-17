# Security posture

## Enforced

| | How |
|---|---|
| Answer not in the client bundle | `server-only` on the schedule + `check:bundle` greps compiled chunks |
| Wins can't be forged | Server derives status from an HMAC-signed session it issued |
| Streaks can't be forged | Client `insert`/`update` revoked; API writes under service-role |
| Identity can't be spoofed | `auth.getUser()` verifies the JWT; `sub` is never read locally |
| No user ids on the leaderboard | `isYou` computed server-side, crosses as a boolean |
| Secrets stay server-side | Tests assert no `NEXT_PUBLIC_` on service-role or Anthropic keys |
| Sweeping the opening call for a free hint | First call per caller per day is recorded server-side; a second group is refused without an outcome |
| AI spend bounded | Per-account quota (durable) + global daily cap + rate limits |
| XSS | No `dangerouslySetInnerHTML`, no `eval`; CSP, HSTS, nosniff, frame-deny |

## Known and accepted

`npm audit` reports **0 vulnerabilities** on Next 16.3.0.

**In-process counters.** Rate limits, the global AI budget and the anonymous
quota count per instance, so they multiply across instances and reset on cold
start. Speed bumps, not guarantees. The signed-in AI quota is in Postgres
because it guards money. See `src/server/memoryCounter.ts`.

**Anonymous AI quota is resettable.** Keyed by IP in memory. Enforcing it
properly means fingerprinting, which is a worse trade for 2 questions.

**The opening-call record is keyed by address for anonymous players.** Rotating
addresses buys fresh calls, exactly as it buys fresh rate-limit windows, and
without Redis the record is per instance. It closes the sweep; it does not make
the call unforgeable. Signed-in players are keyed by their verified id.

**Signed-out local saves are editable.** They are the player's own file and
nothing reads them but that browser. Cloud streaks are server-written.

## Not verified

The RLS revocation, leaderboard ranking, and both model guardrails need a live
project and an API key. Run `npm run cloud:check` and `npm run coach:probe`
after deploying — before announcing.
