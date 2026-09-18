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
