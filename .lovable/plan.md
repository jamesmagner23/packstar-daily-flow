# Piling labour-hire project type

A second project flavour alongside drainage. Same project switcher, same crew/plant plumbing — the daily flow, commercials, and reports branch on `project_type`.

## 1. Data model

Add to `projects`:
- `project_type text not null default 'drainage'` — `'drainage' | 'piling_labour'`

New tables (all RLS-on, scoped via `project_id`):

- **`pile_schedule`** — one row per pile from the uploaded schedule
  - `project_id`, `pile_ref` (e.g. P37-01), `sheet_ref`, `diameter_mm`, `design_depth_m`, `design_volume_m3`, `notes`, `status` ('pending'|'drilled'|'poured'|'complete')
- **`pile_events`** — drilled/poured events per pile per day
  - `project_id`, `pile_id`, `event_date`, `event_type` ('drilled'|'poured'|'cage_set'), `person_id`, `daily_report_id`, `volume_m3`, `notes`
- **`concrete_dockets`** — uploaded docket photos
  - `project_id`, `pile_id` (nullable), `event_date`, `volume_m3`, `supplier`, `docket_number`, `photo_url`, `daily_report_id`
- **`cage_deliveries`** — reo cage drops
  - `project_id`, `delivery_date`, `count`, `photo_urls[]`, `notes`, `daily_report_id`
- **`labour_hire_rates`** — schedule rates the client pays us
  - `project_id`, `classification_id` (nullable for ute), `kind` ('labour'|'ute'|'other'), `nt_rate`, `ot_rate`, `day_rate`, `description`

New storage buckets: `pile-schedules`, `concrete-dockets`, `cage-photos`.

## 2. Commercials

For `project_type = 'piling_labour'`:
- **Revenue** = Σ (crew hours × labour_hire_rates.nt_rate/ot_rate by classification) + ute day rate × ute-days
- **Cost** = existing classification EBA cost × hours (unchanged)
- **Margin** = revenue − cost
- No BOQ involvement — `lib/evening-summary/compute.ts` branches on project_type.

## 3. Pile schedule upload

- New screen `/setup/piles` (only visible when project_type='piling_labour').
- Upload PDF/CSV; PDF parsed with Lovable AI (gemini-2.5-pro, vision) into `pile_schedule` rows. User reviews + confirms before insert.
- The uploaded PDF (e.g. `CH 4200 - Pile Schedule - Sheet 37.pdf`) stored in `pile-schedules` bucket and linked on `projects.pile_schedule_url`.

## 4. Slack daily wrap — piling variant

New prompt template in `lib/prompts/` for piling, asked by the bot at end of shift:
1. Which piles drilled today? (multi-select from outstanding pile_refs)
2. Any concrete pours? → for each: pile_ref, m³, docket photo upload
3. Cages delivered? → count + photos
4. Plant pre-starts confirmed (existing flow)
5. SWMS sign-on (later — flagging out of scope unless wanted now)
6. Issues / variations (existing trigger keyword scan)

Slack webhook handler branches on `project_type` to pick the prompt set. Photos uploaded via Slack get pushed to the right bucket and linked to the relevant `pile_events` / `concrete_dockets` / `cage_deliveries` row.

## 5. Reports — two new sub-tabs

Under `/overview` (or a new top-level `/project-reports` if you prefer), add tabs that appear only for piling projects:

**Client tab** (`/reports/client`)
- Date, piles drilled today (refs), concrete poured (m³ + docket thumbnails), cages delivered, photo gallery, supervisor signoff.
- "Export PDF" — branded, share with head contractor.

**Internal tab** (`/reports/internal`)
- Pile schedule burn-down (X of Y complete, % done, ahead/behind est)
- Daily revenue / cost / margin (same KPI band component, fed from piling commercials)
- Plant utilisation, crew hours

## 6. UI surface changes

- Project switcher: group projects by type (Drainage / Piling labour-hire).
- Nav: hide `/variations` and BOQ-driven `/reports` rows for piling projects; show piles + client-report instead.
- New `/setup/piles` and `/setup/labour-hire-rates` screens.

## 7. Build order (so it's usable early)

1. Schema migration + GRANTs + RLS + storage buckets
2. `labour_hire_rates` admin screen + project_type toggle on project setup
3. Pile schedule PDF upload + AI parse + review screen
4. Piling commercials in compute.ts + KPI band feeds
5. Slack piling wrap prompt + concrete docket / cage capture flows
6. Client report tab + PDF export
7. Internal dashboard tab (pile burn-down + $)

## Technical notes

- All new tables: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` + RLS policies mirroring existing project-scoped patterns.
- PDF parse uses Lovable AI Gateway (`google/gemini-2.5-pro`, no extra API key).
- Server-side logic via `createServerFn` — no new edge functions.
- The uploaded `CH 4200 - Pile Schedule - Sheet 37.pdf` will be used as the first test fixture for the parser.

---

Want me to ship in the order above, or shuffle (e.g. Slack flow first, dashboard later)?