# Option A — supervisor picks their project each evening

Today the bot assumes one project per supervisor (`supervisors.project_id`). You want supervisors who float between sites (Blake, Ryan, Cormac) to be **asked** which job they were on, then the whole report flow runs against that choice.

## What changes

### 1. Data
- Add **Ryan Olsson** as a supervisor row (slack id `U0B6685DL4X`, email `rdolsson01@gmail.com`). He stays in `crew_members` too (he operates plant + supervises — your "Both" choice).
- Keep `supervisors.project_id` as a **default/home** (not a hard constraint). Set Ryan's home → Thompsons Rd, Blake stays Moonee Valley.
- Cormac: skip for now, no Slack yet. Add him when his Slack ID lands.

### 2. Evening DM opener (`daily-prompt.ts`)
Change the opener from "G'day Blake, how'd today go?" to a project picker. Example:

> Evening Blake — which job today?
> • *Moonee Valley* (CC0439)
> • *Thompsons Rd* (T100)
> Just type the name (or "MV" / "TR").

List built dynamically from `projects` where `active = true`.

### 3. Slack webhook (`slack-webhook.ts`)
New first turn before report creation:

```text
no report exists for today
  → parse supervisor's reply against active projects (name, code, common aliases: "moonee"/"mv", "thompsons"/"tr")
    → matched: create daily_reports with that project_id, post real opener ("Beauty — wrapping Moonee Valley. How'd it go?")
    → no match: re-list the active projects and wait
report exists → existing flow unchanged
```

Aliases live in a small map per project (kept in `projects` table later; hardcoded for now since you only have two).

### 4. Reporting
`daily_reports.project_id` is already set per report, so downstream PDF/email/director DM already attribute correctly — no change needed.

## What does NOT change
- Pre-start morning flow (operator-driven, already project-agnostic).
- Director wrap notification.
- The Today screen.
- RLS.

## Open question (won't block — I'll default unless you object)
If a supervisor accidentally picks the wrong project and replies with wrap text on the same line ("Was at Moonee, knocked out 3 pits"), I'll match the project first then treat the remainder as the start of the wrap. Cleaner than forcing two messages.

## Risk
Small. The picker only runs when no report exists for the day. If parsing fails three times the bot just keeps asking — supervisor can ping you to fix.
