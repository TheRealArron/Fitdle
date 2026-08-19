-- ─────────────────────────────────────────────────────────────────────────────
-- Fitdle cloud sync schema
--
-- Run this once in your Supabase project: SQL Editor -> New query -> paste ->
-- Run. Then put the project URL and anon key in .env.local (see .env.example).
--
-- One row per user holding the whole save blob. The save is small (a few
-- hundred bytes), self-contained and always written as a unit, so splitting it
-- into columns would buy nothing and cost a migration every time the shape
-- changes. `jsonb` gives us indexing if that ever stops being true.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.fitdle_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  save       jsonb       not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Leaderboard columns.
--
-- GENERATED, not written separately. The save blob stays the single source of
-- truth and Postgres derives these from it, so a leaderboard column physically
-- cannot drift from the record it ranks - which it would within a week if the
-- server had to remember to update both.
--
-- `username` is the exception: it lives in auth.users.user_metadata, which
-- nobody can read for another user (correctly). The API denormalises it here at
-- bank time so the leaderboard can show a name without ever exposing the
-- account it belongs to.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fitdle_progress
  add column if not exists username text,
  add column if not exists streak int
    generated always as (nullif(save ->> 'streak', '')::int) stored,
  add column if not exists max_streak int
    generated always as (nullif(save ->> 'maxStreak', '')::int) stored,
  -- Today's board: which puzzle, how many guesses, and whether it was solved.
  add column if not exists day_seed int
    generated always as (nullif(save -> 'day' ->> 'seed', '')::int) stored,
  add column if not exists day_guesses int
    generated always as (jsonb_array_length(save -> 'day' -> 'guesses')) stored,
  add column if not exists day_won boolean
    generated always as ((save -> 'day' ->> 'status') = 'won') stored;

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier and AI quota.
 *
 * NOT generated columns, and not part of the save blob. The save is the
 * player's game record, written by the guess endpoint; this is billing-adjacent
 * state written by the AI endpoints. Mixing them would mean an AI question
 * touching the streak row's history, and a save merge from another device
 * potentially resurrecting a spent quota.
 *
 * `ai_day` is the UTC day number, so the reset lines up with the puzzle
 * rollover and a stale row costs nothing - a different day simply reads as zero
 * used rather than needing a sweep job.
 *
 * `tier` is deliberately a free-text column with a default rather than an enum:
 * adding a tier should not require a migration. Nothing trusts a value it does
 * not recognise - an unknown tier falls back to free limits.
 * ─────────────────────────────────────────────────────────────────────────────
 */

alter table public.fitdle_progress
  add column if not exists tier text not null default 'free',
  add column if not exists ai_day int not null default 0,
  add column if not exists ai_count int not null default 0;

/*
 * Indexes.
 *
 * The streak board is `order by streak desc, updated_at asc` - one composite
 * index serves it directly. Partial on `streak > 0` because a table of people
 * on zero is most of the table and none of the leaderboard.
 */
create index if not exists fitdle_streak_board
  on public.fitdle_progress (streak desc, updated_at asc)
  where streak > 0;

-- Today's board is always filtered to one seed first, so that leads the index.
create index if not exists fitdle_daily_board
  on public.fitdle_progress (day_seed, day_guesses asc, updated_at asc)
  where day_won;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security.
--
-- This is the actual protection, not the anon key - that key is public by
-- design and ships in the client bundle. Without these policies every user
-- could read every other user's row.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fitdle_progress enable row level security;

drop policy if exists "read own progress" on public.fitdle_progress;
create policy "read own progress"
  on public.fitdle_progress
  for select
  using (auth.uid() = user_id);

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * The client can READ its progress. It can no longer WRITE it.
 *
 * RLS stops you writing someone else's row. It says nothing about the
 * truthfulness of your own, so while the browser held write permission,
 * `streak: 9999` was a devtools one-liner against your own record. Private,
 * that is merely untidy. On a public leaderboard it is the whole game.
 *
 * Writes now come from the API, using the service-role key, which bypasses RLS.
 * The server is the only party that knows - from a session it signed itself -
 * that a round was genuinely won and in how many guesses.
 *
 * Deleting is kept, because a player must always be able to remove their own
 * data. It cannot be used to inflate anything: the worst it does is reset you
 * to zero.
 * ─────────────────────────────────────────────────────────────────────────────
 */

drop policy if exists "insert own progress" on public.fitdle_progress;
drop policy if exists "update own progress" on public.fitdle_progress;

drop policy if exists "delete own progress" on public.fitdle_progress;
create policy "delete own progress"
  on public.fitdle_progress
  for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest even if a client forgets to send it.
create or replace function public.fitdle_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fitdle_progress_touch on public.fitdle_progress;
create trigger fitdle_progress_touch
  before update on public.fitdle_progress
  for each row
  execute function public.fitdle_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- A note on trust.
--
-- The client computes and uploads its own streak, so a determined user can
-- upload any number they like. This schema does not pretend otherwise. Making
-- streaks authoritative would mean moving the answer and the scoring server
-- side - a Postgres function that owns the daily word and validates each guess
-- - which is a different product decision, not a policy tweak.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic AI quota claim.
--
-- The server used to do this as read-modify-write over the REST API: SELECT the
-- count, compare it to the limit, UPDATE it. Two requests arriving together
-- both read the same number, both decide there is room, and both write it - so
-- the counter advances by one while two messages were spent. On the one path in
-- this app that costs actual money.
--
-- This is the same decision expressed as a single UPDATE. The limit test lives
-- in the WHERE clause, so Postgres evaluates it against the row it is about to
-- lock: if the row does not qualify, no update happens and no message is
-- granted. There is no window between the check and the write because they are
-- the same statement.
--
-- The limits are PARAMETERS, not literals. They belong to the application - see
-- QUOTA in src/server/quota.ts - and duplicating them here would create two
-- sources of truth that drift the first time one is tuned.
--
-- SECURITY DEFINER because it is called with the service-role key from the
-- server and must be able to write a row the caller does not own. `search_path`
-- is pinned: a definer function that resolves unqualified names through the
-- caller's search_path can be tricked into running someone else's table.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fitdle_claim_ai(
  p_user    uuid,
  p_day     int,
  p_free    int,
  p_pro     int,
  p_consume boolean
)
returns table (allowed boolean, used int, quota int, tier text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier  text;
  v_used  int;
  v_quota int;
begin
  -- A player who has never saved has no row yet, and asking the AI a question
  -- should not be the thing that fails. `save` has no default, so it is seeded
  -- empty; the generated leaderboard columns read null out of it, which is
  -- correct for someone who has not played.
  insert into public.fitdle_progress (user_id, save)
  values (p_user, '{}'::jsonb)
  on conflict (user_id) do nothing;

  if p_consume then
    update public.fitdle_progress p
       set ai_day   = p_day,
           -- A row left over from an earlier day restarts at one rather than
           -- continuing, so no sweep job is needed to reset anybody.
           ai_count = case when p.ai_day = p_day then p.ai_count + 1 else 1 end
     where p.user_id = p_user
       and (
         p.ai_day <> p_day
         or p.ai_count < case when p.tier = 'pro' then p_pro else p_free end
       )
    returning p.ai_count, p.tier into v_used, v_tier;

    if found then
      v_quota := case when v_tier = 'pro' then p_pro else p_free end;
      return query select true, v_used, v_quota, v_tier;
      return;
    end if;
  end if;

  -- Reached either because this is a read-only peek, or because the update
  -- above did not qualify - which means the allowance is already spent.
  select p.tier, case when p.ai_day = p_day then p.ai_count else 0 end
    into v_tier, v_used
    from public.fitdle_progress p
   where p.user_id = p_user;

  v_quota := case when v_tier = 'pro' then p_pro else p_free end;
  return query select (v_used < v_quota), v_used, v_quota, v_tier;
end;
$$;

-- Only the server may call it. The service-role key bypasses RLS, but the
-- function is reachable by anyone who can reach PostgREST unless this is said.
revoke all on function public.fitdle_claim_ai(uuid, int, int, int, boolean) from public, anon, authenticated;

