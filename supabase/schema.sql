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
-- Row level security.
--
-- This is the actual protection, not the anon key — that key is public by
-- design and ships in the client bundle. Without these policies every user
-- could read every other user's row.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fitdle_progress enable row level security;

drop policy if exists "read own progress" on public.fitdle_progress;
create policy "read own progress"
  on public.fitdle_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own progress" on public.fitdle_progress;
create policy "insert own progress"
  on public.fitdle_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own progress" on public.fitdle_progress;
create policy "update own progress"
  on public.fitdle_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
-- side — a Postgres function that owns the daily word and validates each guess
-- — which is a different product decision, not a policy tweak.
-- ─────────────────────────────────────────────────────────────────────────────
