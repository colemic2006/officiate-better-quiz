-- Officiate Better Rules Quiz — schema, RLS policies, and seed data
-- Run this once against a fresh Supabase project (SQL Editor, or `supabase db push`).
-- Idempotent-ish: safe to re-run on a project that already has these objects.

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id serial primary key,
  name text unique not null,
  rule_anchor text,
  sort_order int
);

create table if not exists tags (
  id serial primary key,
  name text unique not null,
  first_seen_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  -- Stable ID from the source spreadsheet's `question_id` column. The ingestion
  -- workflow upserts on this, independent of the internal `id` primary key.
  external_id text unique not null,
  category_id int not null references categories(id),
  difficulty text not null check (difficulty in ('Basic','Intermediate','Advanced')),
  question_text text not null,
  choice_a text not null,
  choice_b text not null,
  choice_c text not null,
  choice_d text not null,
  correct_choice char(1) not null check (correct_choice in ('A','B','C','D')),
  rule_refs text,
  ar_refs text,
  explanation text,
  rule_year int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists question_tags (
  question_id uuid references questions(id) on delete cascade,
  tag_id int references tags(id) on delete cascade,
  primary key (question_id, tag_id)
);
create index if not exists idx_question_tags_tag on question_tags(tag_id);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('adaptive','practice')),
  category_filter int references categories(id),
  difficulty_filter text,
  question_count int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_attempts_user on attempts(user_id);

create table if not exists attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id),
  selected_choice char(1) not null check (selected_choice in ('A','B','C','D')),
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);
create index if not exists idx_attempt_answers_attempt on attempt_answers(attempt_id);
create index if not exists idx_attempt_answers_question on attempt_answers(question_id);

create table if not exists user_category_stats (
  user_id uuid not null references profiles(id) on delete cascade,
  category_id int not null references categories(id),
  correct_count int not null default 0,
  total_count int not null default 0,
  last_updated timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table if not exists question_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references profiles(id),
  comment_text text not null,
  is_admin_reply boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists idx_question_comments_question on question_comments(question_id, status);

create table if not exists question_flags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references profiles(id),
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_question_flags_status on question_flags(status);

-- ============================================================================
-- 2. New-user provisioning
-- ============================================================================
-- Supabase Auth writes to auth.users on signup; this trigger mirrors a row
-- into public.profiles so RLS (which is keyed off profiles) has something to
-- check on the very first request. Runs as security definer so it can write
-- to profiles regardless of RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used inside RLS policies to check the caller's admin flag without
-- re-triggering RLS recursion on profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Atomic increment for the rolling per-user/category stats that drive
-- adaptive weighting. Runs as the caller (security invoker, the default) so
-- the existing "own rows" RLS policy on user_category_stats still applies —
-- this only exists to avoid a read-then-write race on the counters.
create or replace function public.increment_category_stat(
  p_user_id uuid,
  p_category_id int,
  p_correct boolean
)
returns void
language plpgsql
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'cannot record stats for another user';
  end if;

  insert into public.user_category_stats (user_id, category_id, correct_count, total_count, last_updated)
  values (p_user_id, p_category_id, case when p_correct then 1 else 0 end, 1, now())
  on conflict (user_id, category_id) do update
    set correct_count = public.user_category_stats.correct_count + excluded.correct_count,
        total_count = public.user_category_stats.total_count + excluded.total_count,
        last_updated = now();
end;
$$;

-- ============================================================================
-- 3. Row-Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table questions enable row level security;
alter table question_tags enable row level security;
alter table attempts enable row level security;
alter table attempt_answers enable row level security;
alter table user_category_stats enable row level security;
alter table question_comments enable row level security;
alter table question_flags enable row level security;

-- profiles ---------------------------------------------------------------
drop policy if exists "profiles: read all" on profiles;
create policy "profiles: read all"
  on profiles for select
  to authenticated
  using (true);

-- Users may edit their own display_name, but never their own is_admin /
-- is_active flags — those are service-role (or admin, for is_active) only.
drop policy if exists "profiles: user updates own non-privileged fields" on profiles;
create policy "profiles: user updates own non-privileged fields"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_admin = (select p.is_admin from profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles: admin can deactivate accounts" on profiles;
create policy "profiles: admin can deactivate accounts"
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- categories / tags / questions / question_tags ---------------------------
-- Readable by any authenticated user. Writable only by the service role
-- (used exclusively by the GitHub Actions ingestion workflow), which bypasses
-- RLS entirely — so no insert/update/delete policies are defined here.
drop policy if exists "categories: read" on categories;
create policy "categories: read" on categories for select to authenticated using (true);

drop policy if exists "tags: read" on tags;
create policy "tags: read" on tags for select to authenticated using (true);

drop policy if exists "questions: read" on questions;
create policy "questions: read" on questions for select to authenticated using (is_active = true);

drop policy if exists "question_tags: read" on question_tags;
create policy "question_tags: read" on question_tags for select to authenticated using (true);

-- attempts -----------------------------------------------------------------
drop policy if exists "attempts: own rows" on attempts;
create policy "attempts: own rows"
  on attempts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- attempt_answers ------------------------------------------------------------
drop policy if exists "attempt_answers: own rows via attempt" on attempt_answers;
create policy "attempt_answers: own rows via attempt"
  on attempt_answers for all
  to authenticated
  using (exists (select 1 from attempts a where a.id = attempt_id and a.user_id = auth.uid()))
  with check (exists (select 1 from attempts a where a.id = attempt_id and a.user_id = auth.uid()));

-- user_category_stats --------------------------------------------------------
drop policy if exists "user_category_stats: own rows" on user_category_stats;
create policy "user_category_stats: own rows"
  on user_category_stats for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- question_comments ----------------------------------------------------------
-- Anyone authenticated can start a thread; it lands as 'pending'. Regular
-- users cannot self-approve or self-badge as an admin reply. Admins get a
-- second, more permissive insert policy so their replies can carry
-- is_admin_reply = true and post pre-approved.
drop policy if exists "question_comments: insert own (pending, non-admin)" on question_comments;
create policy "question_comments: insert own (pending, non-admin)"
  on question_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_admin_reply = false
    and status = 'pending'
  );

drop policy if exists "question_comments: admin insert" on question_comments;
create policy "question_comments: admin insert"
  on question_comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_admin());

drop policy if exists "question_comments: read approved or own or admin" on question_comments;
create policy "question_comments: read approved or own or admin"
  on question_comments for select
  to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());

drop policy if exists "question_comments: admin moderates" on question_comments;
create policy "question_comments: admin moderates"
  on question_comments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "question_comments: admin deletes" on question_comments;
create policy "question_comments: admin deletes"
  on question_comments for delete
  to authenticated
  using (public.is_admin());

-- question_flags ---------------------------------------------------------------
drop policy if exists "question_flags: insert own" on question_flags;
create policy "question_flags: insert own"
  on question_flags for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "question_flags: admin reads" on question_flags;
create policy "question_flags: admin reads"
  on question_flags for select
  to authenticated
  using (public.is_admin());

drop policy if exists "question_flags: admin resolves" on question_flags;
create policy "question_flags: admin resolves"
  on question_flags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- 4. Locked category taxonomy (seed once)
-- ============================================================================

insert into categories (name, rule_anchor, sort_order) values
  ('Definitions', 'Rule 2', 1),
  ('Game, Field & Equipment', 'Rule 1', 2),
  ('Periods & Time Factors', 'Rule 3', 3),
  ('Substitutions', 'Rule 3', 4),
  ('Ball in Play / Dead Ball', 'Rule 4', 5),
  ('Momentum & Impetus', 'Rule 2, Rule 4', 6),
  ('Series of Downs & Line to Gain', 'Rule 5', 7),
  ('Free Kicks', 'Rule 6', 8),
  ('Scrimmage Kicks (Punts)', 'Rule 6', 9),
  ('Forward Pass', 'Rule 7', 10),
  ('Backward Pass & Fumbles', 'Rule 7', 11),
  ('Formation Legality', 'Rule 7', 12),
  ('Scoring', 'Rule 8', 13),
  ('Personal Fouls — Contact', 'Rule 9', 14),
  ('Personal Fouls — Conduct', 'Rule 9', 15),
  ('Penalty Enforcement — Spot & Distance', 'Rule 10', 16),
  ('Penalty Enforcement — Principles', 'Rule 10', 17),
  ('Officials'' Jurisdiction & Duties', 'Rule 11', 18),
  ('Instant Replay — Process', 'Rule 12', 19),
  ('Instant Replay — Targeting', 'Rule 12', 20)
on conflict (name) do nothing;
