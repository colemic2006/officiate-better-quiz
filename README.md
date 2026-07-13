# Officiate Better — Rules Quiz

Adaptive NCAA football rules quizzes for officials. Static frontend (React +
Vite) on GitHub Pages, backed entirely by Supabase (Auth + Postgres + RLS).
No custom backend server.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `supabase/schema.sql`. This creates every table,
   the RLS policies, the new-user trigger, and seeds the 20 locked categories
   (see spec Section 3). It's safe to re-run against a project that already
   has these objects — re-run it any time you pull schema changes (new
   columns, new RLS policies, etc.) to bring an existing database forward.
3. Grab your project's **URL**, **anon/public key**, and **service_role key**
   from Settings → API.
4. To make yourself an admin, run in the SQL Editor (bypasses RLS):
   ```sql
   update profiles set is_admin = true where id = '<your-auth-user-uuid>';
   ```
   Find your UUID under Authentication → Users after signing up once.
5. Under Authentication → URL Configuration, add your deployed site's root
   URL (e.g. `https://<user>.github.io/officiate-better-quiz/`) to **Redirect
   URLs**. This is required for the "forgot password" email link to land
   back on the app instead of falling back to Supabase's default — without
   it, password reset requests still send, but the link in the email won't
   go anywhere useful.

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

`choice_a` and `choice_b` are required on every row; `choice_c` and
`choice_d` are optional, which is what makes True/False (or any
2- or 3-choice) questions possible — just leave those columns blank.
They must be filled in order, though: a row with `choice_d` set but
`choice_c` blank fails validation.

New tags in the semicolon-delimited `tags` column are auto-created
(case-insensitive dedupe). Categories must match one of the 20 locked names
in `categories` exactly — adding a new category is a manual admin action
(see spec Section 3), not something ingestion will do.

Run it locally against your own project with:
```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ingest
```

## 5. Signup notification email

Every new registration sends a notification email (via [Resend](https://resend.com))
to the site owner. Flow: a Postgres trigger on `profiles` insert calls the
`notify-signup` Edge Function (async, via `pg_net`), which looks up the new
user's email through the Admin API and sends the notification through Resend.

One-time setup:

1. Create a free [Resend](https://resend.com) account and grab an API key
   from the dashboard. The function sends from `onboarding@resend.dev`,
   Resend's shared sandbox sender, which works out of the box with no domain
   verification — fine for a low-volume notification like this, but if
   emails start landing in spam, verify your own sending domain in Resend
   and change the `from` address in
   `supabase/functions/notify-signup/index.ts`.
2. Generate a random secret (e.g. `openssl rand -hex 32`) — this authenticates
   calls to the Edge Function so it can't be spammed by anyone who finds the
   URL. Use the same value in the next two steps.
3. Deploy the function and set its secrets with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```
   supabase link --project-ref <your-project-ref>
   supabase functions deploy notify-signup
   supabase secrets set RESEND_API_KEY=<your-resend-api-key>
   supabase secrets set WEBHOOK_SECRET=<the-random-secret-from-step-2>
   ```
   (Pushes to `main` that touch `supabase/functions/**` also auto-deploy the
   function via `deploy-functions.yml` — see repo secrets below — but
   `functions deploy` needs to be run at least once manually to create it,
   and `secrets set` isn't something CI does for you.)
4. In the SQL Editor, set the two Postgres settings the trigger reads (not
   committed to `schema.sql` since this is a public repo):
   ```sql
   alter database postgres set app.supabase_url = 'https://<your-project-ref>.supabase.co';
   alter database postgres set app.webhook_secret = '<the-random-secret-from-step-2>';
   ```
5. Re-run `supabase/schema.sql` to install the `pg_net` extension and the
   trigger.
6. To change the notification recipient away from the default
   (`mcole1008@outlook.com`), set an additional secret:
   `supabase secrets set NOTIFY_EMAIL=<address>`.

For the auto-deploy workflow, add these to GitHub repo secrets too:

| Secret | Used by | Purpose |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `deploy-functions.yml` | personal access token from Supabase account settings, used by the CLI |
| `SUPABASE_PROJECT_REF` | `deploy-functions.yml` | your project's ref (the subdomain in its URL) |

If either the `app.supabase_url` or `app.webhook_secret` Postgres setting is
left unset, the trigger silently no-ops rather than failing signup itself —
so an unconfigured environment just won't send notifications, not break
registration.

## 6. Architecture notes / known trade-offs

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
Missed Questions · Admin (comment/flag moderation + question bank editor) ·
Profile — see spec Section 11.

## Admin-only features

- **CFO National Test mode** (Quiz Setup, admin accounts only): runs a quiz
  drawn solely from a single year's CFO National Test question set (tagged
  `<year>-cfo-rules-test` at ingestion), independent of category/difficulty.
  Years are discovered automatically from whatever tags exist — no code
  change needed when a new test year is ingested.
- **Question bank editor** (Admin page): search/filter existing questions
  and edit any field (category, difficulty, text, choices, correct answer,
  rule/AR refs, explanation, tags, active flag) directly from the browser,
  without touching `data/questions.csv`. Deactivating a question here just
  flips `is_active` off — it hides the question from quizzes without
  deleting it. Note that if that same question's `external_id` later
  appears in a CSV batch and gets re-ingested, the ingest upsert will
  overwrite the in-app edit — the CSV is still the source of truth for bulk
  content.
