# Officiate Better — Rules Quiz

Adaptive NCAA football rules quizzes for officials. Static frontend (React +
Vite) on GitHub Pages, backed entirely by Supabase (Auth + Postgres + RLS).
No custom backend server.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `supabase/schema.sql` once. This creates every
   table, the RLS policies, the new-user trigger, and seeds the 20 locked
   categories (see spec Section 3).
3. Grab your project's **URL**, **anon/public key**, and **service_role key**
   from Settings → API.
4. To make yourself an admin, run in the SQL Editor (bypasses RLS):
   ```sql
   update profiles set is_admin = true where id = '<your-auth-user-uuid>';
   ```
   Find your UUID under Authentication → Users after signing up once.

## 2. Configure the frontend

```
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 3. Configure GitHub repo secrets

For **GitHub Actions**, add these under Settings → Secrets and variables → Actions:

| Secret | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `deploy.yml` | baked into the static build |
| `VITE_SUPABASE_ANON_KEY` | `deploy.yml` | baked into the static build (safe to expose — RLS enforces access) |
| `SUPABASE_URL` | `ingest.yml` | same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `ingest.yml` | **secret** — bypasses RLS to write questions/tags. Never expose client-side. |

Enable GitHub Pages: Settings → Pages → Source → **GitHub Actions**.

If you're deploying to a project page (`https://<user>.github.io/officiate-better-quiz/`),
`vite.config.js`'s `base` is already set correctly. If you attach a custom
domain (add a `CNAME` file), change `base` to `/`.

## 4. Ingesting questions

Edit `data/questions.csv` (or point `SHEET_PATH` at an `.xlsx` file) and push
to `main`. The `ingest` workflow validates every row and — only if the whole
file is valid — upserts into Supabase, matching on the spreadsheet's
`question_id` column (stored as `questions.external_id`). Invalid rows fail
the whole run with row numbers and reasons; nothing is written until the
file is clean. Missing `rule_refs` or `explanation` are warnings only —
both are optional, so leaving either blank still publishes the question.

New tags in the semicolon-delimited `tags` column are auto-created
(case-insensitive dedupe). Categories must match one of the 20 locked names
in `categories` exactly — adding a new category is a manual admin action
(see spec Section 3), not something ingestion will do.

Run it locally against your own project with:
```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ingest
```

## 5. Architecture notes / known trade-offs

- **Answer key exposure:** per the spec's own RLS notes, the `questions`
  table (including `correct_choice`) is readable by any authenticated user —
  grading happens client-side. A user who inspects network traffic can see
  answers before selecting one. Hardening this would require a Supabase Edge
  Function or a `security definer` RPC that hides `correct_choice` from a
  public view and grades server-side (the spec calls this out as a
  optional/conditional hardening step in Section 6, not one of the four
  stated non-negotiables in Section 13). Worth revisiting if this becomes a
  real integrity concern.
- **Account deactivation:** enforced by checking `profiles.is_active` on
  every session load/change and force-signing-out deactivated users
  client-side. There's a small window between deactivation and the user's
  next session check where an already-open tab could still write data,
  since there's no backend to revoke an in-flight session. A Supabase Auth
  Hook (dashboard-configured) could close this gap if needed later.
- **`xlsx` (SheetJS) has known advisories** (prototype pollution / ReDoS) for
  parsing *untrusted* files. It's only used at ingestion time against a
  spreadsheet committed to this repo by trusted maintainers, not arbitrary
  uploads, so the risk is accepted here.
- **Adaptive weighting formula:** `weight = base_weight × (1 - accuracy) +
  new_category_boost`, with never-attempted categories treated as a neutral
  50% prior plus a flat boost — see `src/lib/quizEngine.js`.
- **Recency soft-avoid window:** defaults to 14 days (`RECENCY_WINDOW_DAYS`
  in `src/lib/quizEngine.js`), matching the spec's suggested default.

## Pages

Landing/Sign-in · Dashboard · Quiz Setup · Quiz In Progress · Quiz Results ·
Missed Questions · Admin Moderation Queue · Profile — see spec Section 11.
