# Setting up cloud sync

Fitdle works with no backend — progress just stays in one browser. This turns on
real accounts and a streak that follows you between devices.

Takes about five minutes. Free tier is plenty.

---

## 1. Create the project

1. Sign up at **[supabase.com](https://supabase.com)** and verify your email.
2. **New project**. You'll be asked for:
   - **Name** — anything, e.g. `fitdle`
   - **Database password** — generated is fine. You will not need it for this,
     but save it anyway; it cannot be shown again.
   - **Region** — pick the one closest to your players, not to you.
3. Wait ~2 minutes while it provisions.

## 2. Copy your keys

**Settings → API**. You need two values:

| Field | Looks like |
|---|---|
| **Project URL** | `https://abcdefghijkl.supabase.co` |
| **anon / public** key | a long `eyJ...` string |

Newer projects may show **Publishable key** (`sb_publishable_...`) instead of, or
alongside, the legacy `anon` key. Either works — they're both the browser-safe
key.

> **Never use the `service_role` / `secret` key here.** It bypasses row-level
> security entirely, and anything in `NEXT_PUBLIC_*` is compiled into the
> JavaScript that ships to every visitor. Handing that out would let anyone read
> and rewrite every row in your database.
>
> The anon key being public is fine and intended — RLS is what protects the data.

## 3. Put them in `.env.local`

```bash
cp .env.example .env.local
```

Then edit it:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

No quotes, no trailing spaces. `.env.local` is gitignored.

## 4. Create the table

**SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](../supabase/schema.sql), and **Run**.

It's idempotent — safe to run again if you're unsure whether it took.

That creates `public.fitdle_progress` (one row per user), enables row-level
security, and adds four owner-only policies so a signed-in user can only touch
their own row.

> **Re-run this file if you set the project up before the trusted-clock function
> existed.** `npm run cloud:check` will tell you if it is missing. Until it is
> there, the daily puzzle follows the player's own system clock and winding it
> forward plays tomorrow early.

## 5. Verify

```bash
npm run cloud:check
```

```
✓ keys present  https://abcdefghijkl.supabase.co
✓ project reachable, anon key accepted
✓ table public.fitdle_progress exists
✓ RLS enforced  anonymous reads return nothing, as they should
✓ anonymous writes refused by RLS  42501 insufficient_privilege
✓ trusted clock available  server time readable, local drift 0s

Cloud sync is ready.
```

Anything missing is named with the fix. The two RLS lines are the ones to care
about — if either fails, your table is readable or writable by anyone with the
key, which is everyone.

## 6. Restart the dev server

```bash
# Ctrl-C, then
npm run dev
```

**This step is not optional.** `NEXT_PUBLIC_*` variables are inlined at build
time, not read at runtime, so a server started before you wrote `.env.local`
will not see the keys and the app will still say "Accounts are not set up".

---

## Email confirmation

Supabase requires email confirmation by default. On sign-up the app will say
*"Check your email for a confirmation link, then sign in"* — that's expected, not
a bug.

To skip it while testing: **Authentication → Providers → Email** and turn off
**Confirm email**. Turn it back on before anyone else uses it, or people can sign
up with addresses they don't own.

---

## Troubleshooting

**"Accounts are not set up" after adding keys**
The dev server wasn't restarted. See step 6.

**`table public.fitdle_progress is missing`**
Step 4 didn't run, or ran against a different project. Check the project name in
the dashboard header matches the URL in `.env.local`.

**`RLS is NOT enforced`**
The schema ran but the policies didn't apply. Re-run
[`supabase/schema.sql`](../supabase/schema.sql) — the policy statements are
`drop policy if exists` first, so re-running is safe.

**Sign-in works but the streak doesn't sync**
Open the Account panel; it shows the sync state. "Sync failed" means the row
couldn't be written — usually the update policy. Re-run the schema.

**"Too many attempts"**
Supabase rate-limits auth. Wait a minute.

---

## What this does and doesn't protect

RLS stops one player reading or writing another's row. That's real and it works.

What it does **not** do is make streaks trustworthy. The client computes its own
streak and uploads it, so a determined user can upload any number they like.
Making that authoritative means moving the answer and the scoring server-side —
a Postgres function that owns the daily word and validates each guess — which is
a different product, not a policy change. The schema says so in a comment too.
