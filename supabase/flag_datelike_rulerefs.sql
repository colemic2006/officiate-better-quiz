-- Flag questions whose rule/AR references are date-like or non-standard so they
-- appear in Admin -> Open Flags for manual verification. Idempotent: re-running
-- will not create duplicate open flags. Attributed to an admin profile.
with admin as (
  select id from public.profiles where is_admin = true order by created_at limit 1
),
targets(external_id, reason) as (
  values
    ('Q-0012', 'Rule reference review: non-standard slash/compound reference(s): "9-1-3/4-Penalty". Confirm the correct rule citation before any reformatting.'),
    ('Q-0013', 'Rule reference review: non-standard slash/compound reference(s): "9-1-3/4-Penalty". Confirm the correct rule citation before any reformatting.'),
    ('Q-0211', 'Rule reference review: bare two-part reference(s) that read like a date: "9-1". Confirm the correct rule citation before any reformatting.'),
    ('Q-0224', 'Rule reference review: non-standard slash/compound reference(s): "4-2-1/4-2-3". Confirm the correct rule citation before any reformatting.'),
    ('Q-0249', 'Rule reference review: non-standard slash/compound reference(s): "7-3-2-g/h". Confirm the correct rule citation before any reformatting.'),
    ('Q-0258', 'Rule reference review: non-standard slash/compound reference(s): "10-2-2-c/d-1". Confirm the correct rule citation before any reformatting.'),
    ('Q-0271', 'Rule reference review: non-standard slash/compound reference(s): "6-1-2-b/c". Confirm the correct rule citation before any reformatting.'),
    ('Q-0283', 'Rule reference review: non-standard slash/compound reference(s): "A.R. 8-7-2-II/III". Confirm the correct rule citation before any reformatting.'),
    ('Q-0289', 'Rule reference review: non-standard slash/compound reference(s): "A.R. 9-4-1-VII/VIII". Confirm the correct rule citation before any reformatting.'),
    ('Q-0809', 'Rule reference review: bare two-part reference(s) that read like a date: "6-1". Confirm the correct rule citation before any reformatting.'),
    ('Q-0810', 'Rule reference review: bare two-part reference(s) that read like a date: "9-2". Confirm the correct rule citation before any reformatting.'),
    ('Q-0831', 'Rule reference review: bare two-part reference(s) that read like a date: "2-5". Confirm the correct rule citation before any reformatting.'),
    ('Q-0832', 'Rule reference review: bare two-part reference(s) that read like a date: "2-11". Confirm the correct rule citation before any reformatting.'),
    ('Q-0836', 'Rule reference review: bare two-part reference(s) that read like a date: "6-3". Confirm the correct rule citation before any reformatting.'),
    ('Q-1746', 'Rule reference review: bare two-part reference(s) that read like a date: "2-28". Confirm the correct rule citation before any reformatting.'),
    ('Q-1761', 'Rule reference review: bare two-part reference(s) that read like a date: "2-28". Confirm the correct rule citation before any reformatting.'),
    ('Q-1762', 'Rule reference review: bare two-part reference(s) that read like a date: "2-28". Confirm the correct rule citation before any reformatting.')
)
insert into public.question_flags (question_id, user_id, reason, status)
select q.id, (select id from admin), t.reason, 'open'
from targets t
join public.questions q on q.external_id = t.external_id
where exists (select 1 from admin)
  and not exists (
    select 1 from public.question_flags f
    where f.question_id = q.id and f.reason = t.reason and f.status = 'open'
  );
