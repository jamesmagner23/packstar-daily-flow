## Goal

On lump-sum projects, let the team log dayworks (plant, labour, materials) against the project. Each daywork entry auto-generates a client docket (digitally signed or signed-offline + uploaded). Dayworks flow into the project P&L as a separate "Dayworks / Variations" tile beside the contract, costed using the project's existing rate cards. Admin + Engineer can backfill historic dayworks (e.g. Thompson's Rd) and edit the rate cards.

## Data model (new migration)

**`dayworks`** — header per daywork event
- `project_id`, `work_date`, `reference` (auto e.g. `DW-THR-0007`), `client_contact_name`, `client_contact_email`, `description`, `status` (`draft|awaiting_signature|signed|void`), `signing_method` (`in_app|offline`), `signed_at`, `signed_by_name`, `signature_image_url`, `signed_docket_pdf_url`, `created_by`, `notes`

**`daywork_lines`** — one row per item on the docket
- `daywork_id`, `line_type` (`plant|labour|material`), `plant_item_id` (nullable, FK), `classification_id` (nullable, FK), `description`, `quantity` (hours or units), `unit` (`hr|day|ea|m|m3|t|L`), `client_rate_aud`, `cost_rate_aud`, `revenue_aud` (generated: qty × client_rate), `cost_aud` (generated: qty × cost_rate)

**`daywork_rate_overrides`** (optional — keep simple: just store snapshot rates on the line itself; engineers edit `plant_hire_rate_card` / `labour_hire_rates` directly for future entries).

Storage bucket: `daywork-dockets` (private) for generated + signed PDFs and signature pngs.

### Roles
Add `'engineer'` to the `app_role` enum. Backfill + rate-card edit screens gated via `has_role(uid, 'admin') OR has_role(uid, 'engineer')`.

### RLS / GRANTs
Standard project-scoped pattern, mirroring `daily_reports`. authenticated SELECT/INSERT/UPDATE/DELETE for project members; service_role full.

## P&L integration

Extend `lib/evening-summary/compute.ts` (and the per-project reports query) so that for `project_type='lump_sum'`:
- `contractRev/Cost/Margin` = today's daily_reports figures (unchanged)
- `dayworksRev/Cost/Margin` = sum of `daywork_lines` for date range where status in (`awaiting_signature`,`signed`)
- Surface both on project overview as **two side-by-side tiles**: "Contract" and "Dayworks / Variations" with a combined total underneath.

## UI surface

1. **Project overview (`/`)** — when a project is selected (or in the per-project drilldown), split KPI band into Contract vs Dayworks tiles.
2. **`/dayworks` (project-scoped tab under Projects sidebar)** — list of dayworks, filter by date, status badge, "+ New daywork" button. Row click → editor.
3. **`/dayworks/$id` editor** —
   - Header: date, description, client contact
   - Lines table: add plant (pick from project's `plant_hire_rate_card`, autofills client + cost rate), add labour (pick classification, autofills NT/OT rates from `labour_hire_rates` + EBA cost), add material (free text + qty + unit + rate). Each line shows revenue, cost, margin live.
   - "Generate docket" → renders PDF via `lib/pdf/report-pdf.server.ts` pattern, stores in `daywork-dockets` bucket.
   - Signing: toggle "Sign in-app" (signature pad component, captures PNG, marks signed) OR "Signed offline" (file upload of scanned signed PDF).
4. **`/setup/rates` (admin + engineer)** — edit `plant_hire_rate_card` and `labour_hire_rates` per project; add new line items. Already partly exists at `/piles/rates` for piling — generalise into per-project rate editor reachable from project Setup.
5. **Backfill** — daywork editor accepts any past `work_date`; engineer role granted same access as admin via `has_role` checks. Audit fields (`created_by`, `created_at`) capture who backfilled.

## Build order

1. **Migration**: `dayworks` + `daywork_lines` + bucket + `engineer` role + GRANTs/RLS.
2. **Rate editor** (`/setup/rates/$projectId`) — admin/engineer can edit plant + labour rate cards, add items.
3. **Daywork list + editor** — line builder pulling from rate cards, save as draft.
4. **PDF generation + offline-signed upload path.**
5. **In-app signature pad + signing flow.**
6. **P&L compute split** — extend `compute.ts` and project overview tiles.
7. **Backfill polish**: surface Thompson's Rd shortcut, validate engineer can edit any historic date.

## Open items (call out before building)

- Docket numbering: format `DW-{project.code}-{seq}` — seq per project. OK?
- Client signing link: email contains tokenised URL `/sign/daywork/$token`, public route (no login). Token stored on `dayworks.signing_token`, expires in 14 days. OK?
- "Materials" cost rate: do we track a cost separate from client rate, or is materials usually rebill-at-cost + markup %? Assuming separate client/cost columns; markup is implicit in the difference.

Want me to ship in this order, or jump straight to (3) + (6) so the operational + P&L value lands first, then come back to rates editor + signing polish?
