-- Hide AND flag every "what if" question. Idempotent — safe to re-run.
--
-- These items have a second ("What if ...") question baked into the stem, so
-- they effectively carry two correct answers. We (1) hide them from users
-- (is_active = false) and (2) open a review flag so they show up in
-- Admin -> Open Flags to be split or trimmed before being re-activated.
--
-- Supersedes hide_whatif_questions.sql (that only did step 1); running this
-- after it is fine, the hide step just no-ops on already-hidden rows.

-- 1) Hide them from users. Only flips currently-active matches.
update public.questions
set is_active = false, updated_at = now()
where question_text ilike '%what if%'
  and is_active = true;

-- 2) Flag them for review, attributed to an admin profile. Won't duplicate an
--    existing open "what if" flag, so re-running adds nothing new.
with admin as (
  select id from public.profiles where is_admin = true order by created_at limit 1
)
insert into public.question_flags (question_id, user_id, reason, status)
select
  q.id,
  (select id from admin),
  'Contains a "What if ..." second question in the stem (effectively two correct answers). Hidden pending review — split into separate questions or trim before re-activating.',
  'open'
from public.questions q
where q.question_text ilike '%what if%'
  and exists (select 1 from admin)
  and not exists (
    select 1 from public.question_flags f
    where f.question_id = q.id
      and f.status = 'open'
      and f.reason like 'Contains a "What if%'
  );
