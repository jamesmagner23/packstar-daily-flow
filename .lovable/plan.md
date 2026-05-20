# Phase 3 — Inductions

Big scope, so locking the plan before I start cutting code. Pre-flight (bucket, helper fn, MVRC site row) I'll bundle into the first migration unless you've already run them — say the word and I'll skip.

## 1. Pre-flight migration

One migration covering:
- Storage bucket `induction-evidence` + RLS mirroring `ticket-evidence`
- `get_supervisor_slack_id(uuid) returns text` SQL helper
- Seed MVRC into `sites` (idempotent — `on conflict do nothing` on name+job_id)
- New table `induction_expiry_notice_log(person_induction_id uuid, expires_date date, band text, sent_on date, primary key (person_induction_id, sent_on))` for the cron delta cache
- New table `eligibility_alert_log(person_id uuid, site_id uuid, allocation_date date, sent_at timestamptz, primary key (person_id, site_id, allocation_date))` for the debounce on the allocation hook
- DB trigger on `daily_allocations` insert/update → `pg_net.http_post` to `/api/public/hooks/allocation-eligibility` with the row payload. (Trigger fires async, doesn't block the write.)

## 2. UI

### `/crew/[id]` Inductions tab (replace the Phase 2 placeholder)
- Card grid per `person_inductions` row: site name, status badge with the colour rules you spec'd (auto-derive `expiring` when completed + expires within 30d), key date, evidence thumb (signed URL from `induction-evidence`)
- "Add induction" (admin) — site picker, defaults status `not_booked`
- Edit modal — status, booked_for/completed/expires dates, evidence upload. Same dialog reused from the Crew Status matrix on `/sites/[id]`.

### `/sites` list
- Columns: name, head_contractor, lead_time, active jobs (count via `projects.id = sites.job_id`), inducted count, expiring-30d count
- Active toggle filter, name search, "Add site" (admin)

### `/sites/[id]`
- Header with edit-in-place admin controls (name, contractor, contact, lead time, active toggle, notes)
- Tabs: **Requirements** (site_requirements rows, competency picker + induction_required toggle), **Crew Status** (matrix of active crew × this site's induction status, click-to-edit, sorted red-first), **Tasks** (task_requirements admin CRUD)

### `/crew` list — new Induction column
Single rolled-up badge per the rules (green / amber / red / grey). Red also considers `daily_allocations` in next 7 days against sites where induction isn't completed — computed in a small server fn so the list query stays cheap.

### Roles
- Admin: full edit everywhere
- Supervisor: read all; edit `person_inductions` only for crew where `default_supervisor_id = current_user_person_id()`. RLS policies added in the migration.
- Crew: redirected to Slack like everywhere else.

### Sidebar
Add "Sites" entry under People (or alongside Crew — tell me if you'd rather it sit elsewhere).

## 3. Slack handlers (TanStack server routes & functions)

### 3a. Allocation eligibility hook
`POST /api/public/hooks/allocation-eligibility` — called by the DB trigger.
- Resolve `site_id` from `sites.job_id = allocation.job_id` (first match)
- Resolve `task_type` from `classifications.classification`
- Call `check_eligibility(...)`
- DM admin / supervisor per your spec, using `get_supervisor_slack_id` with fallback to `DIRECTOR_SLACK_USER_ID` prefixed `(supervisor unset)`
- Debounce via `eligibility_alert_log` (skip if already sent for this person+site+date within last 6h)

### 3b. Daily 7am expiry sweep
`POST /api/public/hooks/induction-expiry-sweep` — pg_cron at 7am AEDT (21:00 UTC).
- Pull `person_inductions` where `status='completed'` and `expires_date` between today and +60d
- Bucket into 60d/30d/14d/7d bands (each row gets its tightest band)
- Skip rows already in `induction_expiry_notice_log` for today
- Single grouped DM to admin; insert log rows for what was sent

### 3c. Slack dispatcher additions
In `src/routes/api/public/slack-webhook.ts` + a new `src/lib/slack/induction.ts`:
- **Intent: `eligibility_query`** — regex `/^can\s+(.+?)\s+do\s+(.+?)(?:\s+(today|tomorrow|\d{4}-\d{2}-\d{2}))?$/i`. Fuzzy match crew + site (reuse `find_crew_by_name` pattern), call `check_eligibility(person, site, null, date)`, reply formatted yes/no.
- **Intent: `induction_submission`** — when a photo arrives with caption matching `/induction/i` or `/inducted at/i`. Claude extracts site + completed_date + expires_date (ask in reply if expires missing). Upload to `induction-evidence/{person_id}/{site_code}-{completed}.jpg`, upsert `person_inductions` on (person_id, site_id), DM crew confirmation + DM admin with `/crew/[id]` link.
- Existing photo-ticket dispatch stays; we branch on caption keyword first (`induction` → induction handler, else → ticket handler, else → fallback).

## 4. pg_cron schedule
Use the existing pattern (anon-key header). Schedule `0 21 * * *` UTC for 7am AEDT (daylight savings will drift this by an hour twice a year; matches the same compromise as the 4:30pm cron).

## Technical notes

- All new server routes under `/api/public/*` so they bypass auth on the published site; they validate the `apikey` header anyway.
- The trigger uses `pg_net.http_post` so the allocation write is never blocked by Slack latency.
- `induction-evidence` bucket: private, signed URLs for thumbnails, same RLS as `ticket-evidence`.
- For the Crew column "next-7-day red" check, I'll do a single `daily_allocations` join in the list query rather than per-row server fns.
- Mobile-responsive but desktop-first, matching existing pages.

## Open question

Want me to also seed the MVRC `site_requirements` rows (White Card + the Symal-specific set) in the same migration, or leave that for you to populate from the UI once `/sites/[MVRC]/requirements` lands? Default: leave it, ship the UI, you fill in.

## Build order

1. Migration (bucket, helper fn, MVRC seed, log tables, trigger, RLS)
2. Induction edit modal + Inductions tab on `/crew/[id]`
3. `/sites` list and `/sites/[id]` with all three tabs
4. `/crew` list induction column
5. Allocation eligibility hook route + verify trigger fires
6. Expiry sweep route + pg_cron schedule
7. Slack dispatcher: eligibility_query intent + induction photo flow
8. Smoke test against Blake/Owen against MVRC

Approve and I'll start with the migration.