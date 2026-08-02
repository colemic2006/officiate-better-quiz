-- Pull the 2025 COC Offseason Test questions (Q-2362..Q-2456) out of rotation
-- until they are reviewed. They were imported before "new imports land out of
-- rotation" was in effect, so they went live active. Marking each reviewed in
-- the admin review queue re-activates it. Idempotent.

update public.questions
set is_active = false, updated_at = now()
where external_id between 'Q-2362' and 'Q-2456'
  and reviewed_at is null;
