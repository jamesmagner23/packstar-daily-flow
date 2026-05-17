
## Scope this round

1. **Time-range toggle on Finance → Dashboard**: Daily / Weekly (Mon–Sat) / Monthly / Custom date range. State lives in URL search params so the view is shareable and survives refresh.
2. **Crew filter**: "All crews" + one entry per active supervisor (we treat each supervisor as a crew — no schema change). Filter applies to KPIs, recent wraps list, and variations.
3. **Long-hire plant flags**: any plant_item that has appeared in `daily_reports.plant_hours` continuously (no gap ≥ 3 working days) for 4+ weeks → flag panel on Dashboard + full list on Utilisation tab.
4. **Profitability analytics** on Utilisation tab: top/bottom BOQ refs by margin contribution over the selected range.

Crews stay as a relabel of supervisors. No new tables. No changes to slack-webhook, prompts, or evening-summary compute.

## Files I'll touch

```
src/lib/
  date-range.ts                NEW — Mon–Sat week math, range presets, parsing
  reports-aggregate.ts         NEW — client-side aggregation helpers (KPI roll-up, by-BOQ margin, plant-on-hire detection) over fetched daily_reports rows

src/components/
  RangeToggle.tsx              NEW — daily/weekly/monthly/custom segmented control + date input
  CrewFilter.tsx               NEW — All crews + per-supervisor dropdown
  KpiBand.tsx                  NEW — extract the 5-stat band so it can render aggregated values

src/routes/
  index.tsx                    EDIT — add validateSearch (range, from, to, crewId), use aggregation helpers, render new controls + long-hire flag panel
  utilisation.index.tsx        EDIT — replace "Coming soon" with profitability + on-hire panels (shares range/crew search params via retainSearchParams)
  reports.index.tsx            EDIT (small) — accept ?crewId filter when navigated from dashboard

src/routes/__root.tsx          EDIT — add validateSearch for shared params (range, from, to, crewId) so children inherit
```

## Technical notes

- **URL state**: `?range=day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&crewId=<uuid|all>`. Defaults: `range=week`, anchored on today's Mon–Sat. Uses `@tanstack/zod-adapter` with `fallback()`. Add `retainSearchParams(["range","from","to","crewId"])` at root.
- **Week math** (`date-range.ts`): `getWeekRange(date)` returns Mon..Sat of the week containing `date`. Monthly = calendar month. Custom = arbitrary from/to. All ranges inclusive, ISO date strings.
- **Data fetch**: one `useQuery` per route fetches `daily_reports` between `from` and `to` (filtered by `supervisor_id` if crewId set). KPI band sums revenue/cost/margin; productivity = revenue / (expected_daily_revenue × working_days_in_range). Working days = Mon–Sat count.
- **Plant-on-hire detection**: fetch all `daily_reports` rows for the active project in the last ~60 days, flatten `plant_hours[].plant_id`, group by plant_id, compute longest continuous streak allowing ≤2 gap days. Flag if streak ≥ 28 calendar days. Joined against `plant_items` for description.
- **Profitability**: re-use `boq_lines.rate`; for each report's `works_completed`, compute `quantity × pct_complete × rate` as line revenue, group by `boq_ref` over the selected range. Sorted desc → top 5, asc → bottom 5. Margin attribution stays revenue-only (cost isn't BOQ-linked); label clearly as "revenue contribution".
- **Empty states**: when no reports in range, KPI band shows em-dashes, recent wraps shows "No wraps in this range — last submitted {date}".
- **No DB migration**, no backend changes. All aggregation is client-side over the queried rows (volumes are small — single project, ~60 reports max).

## What I'm NOT doing this round (capture as follow-ups)

- Crew-vs-crew comparison view
- Crews as a first-class table (will revisit when a second supervisor joins)
- Per-line cost attribution (needs allocation rules)
- Email/Slack notifications for long-hire flags — UI surface only for now
