-- Hide every question whose stem contains a "what if" follow-up from users,
-- pending manual validation.
--
-- Why: in these items the "What if ..." clause is really a second question
-- baked into the first, so the question effectively has two correct answers
-- and isn't a clean single-answer multiple choice until it's reviewed/split.
--
-- Effect: sets is_active = false. Regular users can no longer see these (the
-- questions RLS read policy is `using (is_active = true)`, the guest RPC and
-- quiz fetches both filter on it); admins still see them.
--
-- Idempotent: only flips currently-active matches, so re-running is a no-op.
--
-- To review them afterward: Admin -> Question Bank, tick "Include inactive"
-- and search "what if". Once a question is validated (or split into two),
-- re-activate it with the Reactivate button, or set is_active = true here.

update public.questions
set is_active = false, updated_at = now()
where question_text ilike '%what if%'
  and is_active = true;
