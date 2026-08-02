-- Take the questions with non-standard / ambiguous rule references OUT OF
-- ROTATION until they can be manually cleared. These use compound slash
-- citations (e.g. "9-1-3/4-Penalty", "4-2-1/4-2-3", "7-3-2-g/h") that can't be
-- safely reformatted without possibly changing which rule is meant, so they
-- are hidden from users rather than auto-fixed.
--
-- They are already flagged (see flag_datelike_rulerefs.sql), so they appear in
-- Admin -> Open Flags. To put one back in rotation, fix its rule reference and
-- check "Active" in the admin edit form (or resolve the flag). Idempotent.

update public.questions
set is_active = false, updated_at = now()
where external_id in ('Q-0012','Q-0013','Q-0224','Q-0249','Q-0258','Q-0271')
  and is_active = true;
