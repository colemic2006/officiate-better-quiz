-- Officiate Better Rules Quiz — schema, RLS policies, and seed data
-- Run this once against a fresh Supabase project (SQL Editor, or `supabase db push`).
-- Idempotent-ish: safe to re-run on a project that already has these objects.

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Required at signup (enforced client-side) as separate first/last name
  -- fields rather than a free-form handle; display_name is derived from
  -- them ("First Last") and kept as its own column since it's what
  -- comments/flags/admin views already read.
  first_name text,
  last_name text,
  display_name text,
  -- Officiating conference/association the user works for. Required at
  -- signup (enforced client-side) so admins can see who's on what crew;
  -- left nullable here rather than not-null so it doesn't break profile
  -- rows created outside the app's signup form (e.g. a Supabase dashboard
  -- invite).
  conference text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Re-running this file against a database created before these columns
-- existed: bring them forward without touching existing rows.
alter table profiles add column if not exists conference text;
alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists last_name text;

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
  -- At least 2 choices (A/B) are required, e.g. for True/False questions.
  -- C and D are optional but must be filled in order — no skipping B then D.
  choice_a text not null,
  choice_b text not null,
  choice_c text,
  choice_d text,
  correct_choice char(1) not null check (correct_choice in ('A','B','C','D')),
  rule_refs text,
  ar_refs text,
  explanation text,
  rule_year int not null,
  -- Question number within the original source document (e.g. "9" for
  -- Question 9 of a weekly quiz PDF), so a content issue can be traced back
  -- to the source. Nullable/optional: not every question's source doc is
  -- structured as a clean numbered list we can map 1:1 (e.g. the CFO
  -- National Test batches), so this is left blank rather than guessed.
  source_question_number int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint choices_contiguous check (choice_d is null or choice_c is not null),
  constraint correct_choice_has_text check (
    correct_choice not in ('C', 'D')
    or (correct_choice = 'C' and choice_c is not null)
    or (correct_choice = 'D' and choice_d is not null)
  )
);

create table if not exists question_tags (
  question_id uuid references questions(id) on delete cascade,
  tag_id int references tags(id) on delete cascade,
  primary key (question_id, tag_id)
);
create index if not exists idx_question_tags_tag on question_tags(tag_id);

-- Re-running this file against a database created before source_question_number
-- existed: bring the column forward without touching existing rows.
alter table questions add column if not exists source_question_number int;

-- Editorial review workflow: an admin walks the whole bank one question at a
-- time, edits as needed, and marks each complete. `reviewed_at` null means the
-- question hasn't been reviewed yet; a timestamp records when it was signed off
-- and `reviewed_by` records which admin did it. Both are writable by admins via
-- the existing "questions: admin update" RLS policy — no new policy needed.
alter table questions add column if not exists reviewed_at timestamptz;
alter table questions add column if not exists reviewed_by uuid references profiles(id);
create index if not exists idx_questions_reviewed_at on questions(reviewed_at);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('adaptive','practice','national_test')),
  category_filter int references categories(id),
  difficulty_filter text,
  -- Set only for mode = 'national_test': the source tag (e.g. '2025-cfo-rules-test')
  -- the quiz was drawn from, so history/dashboard views can label it by year.
  tag_filter text,
  question_count int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_attempts_user on attempts(user_id);

-- Re-running this file against a database created before national_test mode
-- or tag_filter existed: bring both forward without touching existing rows.
alter table attempts add column if not exists tag_filter text;
alter table attempts drop constraint if exists attempts_mode_check;
alter table attempts add constraint attempts_mode_check check (mode in ('adaptive','practice','national_test'));

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
  insert into public.profiles (id, first_name, last_name, display_name, conference)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'conference'
  )
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

-- Lets the Admin page list every registered user with their email and last
-- login time, neither of which lives on public.profiles or is exposed to
-- PostgREST — auth.users is a protected schema. Security-definer + an
-- internal admin check (rather than RLS, which can only restrict by row,
-- not by column) is the sanctioned way to read from it safely: any
-- authenticated user can call this function, but only admins get past the
-- check inside it.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  conference text,
  is_admin boolean,
  is_active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select
      p.id,
      p.first_name,
      p.last_name,
      p.display_name,
      au.email::text,
      p.conference,
      p.is_admin,
      p.is_active,
      p.created_at,
      au.last_sign_in_at
    from public.profiles p
    join auth.users au on au.id = p.id
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- Lets a signed-out visitor try a handful of questions on the front page
-- without an account. The `questions` table's own read policy is
-- authenticated-only, so this is security-definer with a narrow,
-- read-only, fixed-shape result (active questions only, capped count) —
-- deliberately not a general anon SELECT grant on the table itself.
create or replace function public.random_questions(p_count int default 5)
returns table (
  id uuid,
  external_id text,
  category_name text,
  difficulty text,
  question_text text,
  choice_a text,
  choice_b text,
  choice_c text,
  choice_d text,
  correct_choice char(1),
  rule_refs text,
  ar_refs text,
  explanation text
)
language sql
security definer
set search_path = public
as $$
  select q.id, q.external_id, c.name, q.difficulty, q.question_text,
    q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.correct_choice,
    q.rule_refs, q.ar_refs, q.explanation
  from public.questions q
  join public.categories c on c.id = q.category_id
  where q.is_active = true
  order by random()
  limit least(greatest(p_count, 1), 10);
$$;

revoke all on function public.random_questions(int) from public;
grant execute on function public.random_questions(int) to anon, authenticated;

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
-- Readable by any authenticated user. Bulk writes (new questions, new tags)
-- happen only via the service role, used exclusively by the GitHub Actions
-- ingestion workflow, which bypasses RLS entirely. Admins additionally get
-- narrow write access from the app itself so they can correct existing
-- questions and their tags from the Admin page without touching the CSV.
drop policy if exists "categories: read" on categories;
create policy "categories: read" on categories for select to authenticated using (true);

drop policy if exists "tags: read" on tags;
create policy "tags: read" on tags for select to authenticated using (true);

-- Admins can create a tag from the question editor (e.g. retagging a
-- question with a source tag that doesn't exist yet). Renaming/deleting tags
-- is intentionally not exposed — that's still ingestion-only.
drop policy if exists "tags: admin insert" on tags;
create policy "tags: admin insert"
  on tags for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "questions: read" on questions;
create policy "questions: read" on questions for select to authenticated using (is_active = true);

-- Admins see inactive questions too, so a question they just deactivated
-- doesn't disappear from their own admin view.
drop policy if exists "questions: admin read all" on questions;
create policy "questions: admin read all"
  on questions for select
  to authenticated
  using (public.is_admin());

-- Admins can edit existing questions (text, choices, category, tags,
-- active flag, etc.) directly from the Admin page. Creating brand-new
-- questions or deleting rows outright is still ingestion-only; "deleting" a
-- question from the admin page just flips is_active off.
drop policy if exists "questions: admin update" on questions;
create policy "questions: admin update"
  on questions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "question_tags: read" on question_tags;
create policy "question_tags: read" on question_tags for select to authenticated using (true);

-- Admins can relink a question's tags (add/remove) when editing it.
drop policy if exists "question_tags: admin manage" on question_tags;
create policy "question_tags: admin manage"
  on question_tags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
