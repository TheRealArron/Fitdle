# What is left to do

Written 2026-09-29, at the end of an autonomous improvement session. Everything
here was measured, not guessed. Each item says who can do it: **you** means it
needs credentials, a browser, or a decision I cannot make from a terminal.

`npm run verify` passes. `npm run cloud:check` and `npm run coach:probe` do not,
and both are blocked on things only you can supply — that is the whole of §1.

---

## 1. Blocked on you — nothing in the repo can fix these

### 1.1 Run `supabase/schema.sql` against the live project  ·  **blocking**

`npm run cloud:check` exits 1 on this, and two shipped features are degraded
until it is done.

```
✗ the function fitdle_reset_progress is missing
? daily board ranking not checked (no banked rounds to compare against yet)
```

**What is wrong without it**

| | Now | After |
|---|---|---|
| "Reset my statistics" | Falls back to deleting the whole row, which also clears `tier` and the AI counters | Clears the save only |
| The "Today" board ranks | `jsonb_array_length(save->'day'->'guesses')` — the number a restart can lower. Measured on a real row: `day_guesses=1` where `save.day.spent=6` | `save.day.spent`, which a restart cannot lower |

**How** — Supabase → SQL Editor → New query → paste the whole of
`supabase/schema.sql` → Run. Every statement is `if not exists`,
`drop … if exists` before `create`, `create or replace`, or a `grant`/`revoke`,
so re-running it in full is safe and costs nothing. The one statement without
`if not exists` (`add column day_guesses`) is preceded by its own
`drop column if exists`, and it is a generated column, so Postgres recomputes it
from the same blob.

Then re-run `npm run cloud:check`. The first line should turn green, and the
board-ranking line turns green after anyone finishes a round.

**Why I could not do it.** There is no path to DDL from a terminal with only
these credentials:

```
rpc exec_sql / execute_sql / sql / query / exec  →  PGRST202, none exist
.env.local, .env.example                         →  no connection string, no DB password
psql, supabase CLI                               →  not installed
```

The service-role key is a PostgREST key, not a Postgres password.

### 1.2 Run `npm run coach:probe` with a real API key  ·  **before launch**

```
ANTHROPIC_API_KEY=sk-ant-… npm run coach:probe
```

Fourteen adversarial cases: seven at the coach, seven at the guide. It costs a
few cents and it is **the one thing in this repo that has never run**. The
prompts' wording is unit-tested; the models' behaviour is not, and those are
different claims.

What it would tell you that nothing else can:

- Whether the coach can be talked into coaching through joint pain — the only
  guardrail in the prompt that is not about product scope.
- Whether the guide names an exercise. It is reachable **mid-round**, so any
  exercise name is a leak to someone still playing. Its defence is structural
  (its prompt has never seen the catalogue) but the model's own knowledge of
  fitness is not something the prompt can remove — see §3.1.
- Whether either has been hardened into uselessness. Over-refusal is scored as a
  failure too, deliberately.

### 1.3 Optional: a shared rate-limit counter

```
? no shared rate-limit counter (limits count per instance and reset on cold start)
```

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` and every limit
becomes true across the fleet instead of per instance. Without it the app is
correct, just weaker: rate limits, the global AI budget, the anonymous quota and
the opening-call record all count per process.

### 1.4 Set `NEXT_PUBLIC_API_URL` before shipping the extension

A static export has no server. Built without it, the popup installs, renders,
and says *"Cannot reach the server"* with a retry — which is honest, and is not
a playable game. `npm run build:extension` warns about this on every build.

### 1.5 Load `extension-dist/` in your own Chrome once

`npm run smoke` loads it into Playwright's Chromium and drives the popup, which
is what caught the popup being dead. Your Chrome, your profile, the real
install flow, and the Web Store's view of the manifest are still unseen.

---

## 2. Decisions I did not make for you

### 2.1 A payment provider

`tier` is a plain text column defaulting to `free`. Setting it to `pro` is a
one-line update and that is the seam a checkout would write to. Choosing a
processor, handling webhooks and holding customer money is not something to
inherit from a default.

### 2.2 `SCHEDULE_SIZE` and the launch date

Both renumber things that people may already have shared:

- Raising `SCHEDULE_SIZE` from 62 reshuffles every future date. Golden
  date→answer pairs are pinned by tests so it fails loudly.
- `NEXT_PUBLIC_LAUNCH_DATE` sets Puzzle #1. Changing it later renumbers every
  puzzle, including ones already shared. Set it once, before launch.

### 2.3 The model behind each surface

`FITDLE_GUIDE_MODEL` and `FITDLE_COACH_MODEL` both default to `claude-opus-5`.
The guide recites rules that are already in its prompt, so a smaller model loses
little there; the coach gives form advice, where the answer is the product.
Haiku for the guide and Opus for the coach is a reasonable split, and it is the
single biggest lever on what this costs you.

---

## 3. Known and accepted — real, understood, not defects to fix blindly

### 3.1 The guide is safe by construction against the catalogue, not against the model

`src/server/guide.ts` says it is "safe by construction, not by instruction", and
that is true of the **app's data**: the prompt has never seen the catalogue, and
three tests keep it that way.

It is not true of the **model's own knowledge**. `claude-opus-5` knows what a
deadlift is without being told. The only thing standing between "name a
six-letter exercise that works the hamstrings" and an answer is a sentence in
the prompt telling it not to — which is an instruction, the category the file
says it refuses to rely on. `coach:probe` (§1.2) is what would measure this.

### 3.2 Anonymous players are uncounted, deliberately

The per-day guess cap, the opening-call record and the anonymous AI quota all
key on an address for signed-out players, and an address is shared by everyone
behind one NAT. Charging a stranger's guesses to you would be worse than the
hole it closes, so anonymous play keeps the older, looser behaviour. Their save
is their own file and nothing else reads it.

### 3.3 A failed model call still spends the player's quota

If the request reaches Anthropic and then errors, the message is gone from their
daily allowance. Refunding it needs `fitdle_claim_ai` to decrement — another
migration — and it is genuinely ambiguous, because the spend may have happened.
The unambiguous case (no key configured, so no request at all) is fixed: the
routes peek instead of claiming.

### 3.4 The CSP allows inline script

`script-src 'self' 'unsafe-inline'`. A nonce needs per-request rendering and
this page is statically prerendered. `next.config.ts` explains what was tried
and what the rest of the policy still buys.

---

## 4. Work I would do next, in this order

1. **A behavioural test for the coach's and guide's gates at the route level.**
   Six routes are now importable by tests, and `openingCall.test.ts` calls one.
   The coach's three 403 gates are still asserted by counting `status: 403` in
   the source, which passes if the gate is inverted.
2. **Refunding the AI quota on a failed call** (§3.3), if you decide the
   migration is worth it.
3. **`scripts/smoke.mjs` is over 900 lines.** It earns its length — it is the
   check that has caught the most real regressions here — but it is now four
   distinct passes (dev, prod, extension, and the a11y block inside the first
   two) in one file. Splitting it is a refactor with no behavioural change, so
   it is worth doing only when something else is being changed there anyway.
4. **`check:bundle`'s coaching-text and video-id scans** use a plain `includes`,
   unlike the run scan that was fixed. No window problem, but I never planted
   anything against them.
5. **A screen-reader pass.** The accessible tree, names, roles and live regions
   are asserted from the DOM in `npm run smoke`. NVDA or VoiceOver reading the
   board aloud is the real test and needs a person.
6. **Focus visibility.** The checks confirm where focus *is*, not that a visible
   ring follows it. Nothing covers focus styling.

---

## 5. How to check the state of any of this

```bash
npm run verify        # everything: typecheck, lint, audit, 268 tests, both
                      # builds, leak scan, size ratchet, contrast, and 30+30+9
                      # browser checks across dev, prod and the extension
npm run cloud:check   # the live Supabase project; ends with a numbered to-do
npm run coach:probe   # needs ANTHROPIC_API_KEY; has never run
```

`docs/session-log.md` has one entry per iteration: what was audited, what
changed, the mutation table, the measurements with the command that produced
them, and an explicit "what I did not verify".
