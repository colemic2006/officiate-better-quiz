-- Remove 9 duplicate questions accidentally added in the first MWC/CUSA batch.
-- Each duplicates a scenario+ruling already in the bank; the near-match was
-- missed because the new copies led with a possession letter ("A 4/12 @ ...").
-- They have already been removed from data/questions.csv, but the ingest is
-- upsert-only and never deletes, so this removes them from the live database.
--
--   Q-2287 == Q-0578    Q-2296 == Q-1003    Q-2301 == Q-1354
--   Q-2288 == Q-1228    Q-2297 == Q-1042    Q-2302 == Q-1342
--   Q-2289 == Q-1229    Q-2300 == Q-1341
--   Q-2291 == Q-1308
--
-- question_tags rows cascade-delete. The guard skips any question that somehow
-- already has recorded answers (so no attempt history is lost); if a row is
-- skipped you can Deactivate it from the admin panel instead. Idempotent.

delete from public.questions q
where q.external_id in
      ('Q-2287','Q-2288','Q-2289','Q-2291','Q-2296','Q-2297','Q-2300','Q-2301','Q-2302')
  and not exists (select 1 from public.attempt_answers aa where aa.question_id = q.id);
