import type { ComputedReport } from "./compute";

export type VariationFlag = {
  id: string;
  claim_type: string;
  clause_ref: string;
  trigger_phrase: string | null;
  status: string;
  deadline_at: string | null;
  notice_deadline_bd: number | null;
  duration_impact_hours: number | null;
  symal_rep_saw: boolean | null;
};

export type RenderInput = {
  projectName: string;
  projectShortCode: string; // e.g. "MVRC"
  reportDate: string; // YYYY-MM-DD
  supervisorName: string;
  computed: ComputedReport;
  variationFlags: VariationFlag[];
  productivityNote: string | null;
  rawTranscript: string | null;
  dashboardBaseUrl: string;
};

const MELB_TZ = "Australia/Melbourne";

function fmtAUD(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function fmtDayDate(iso: string): { day: string; date: string } {
  const d = new Date(`${iso}T12:00:00`);
  const day = new Intl.DateTimeFormat("en-AU", { timeZone: MELB_TZ, weekday: "long" }).format(d);
  const date = new Intl.DateTimeFormat("en-AU", { timeZone: MELB_TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
  return { day, date };
}

function businessDaysUntil(deadlineIso: string | null): number | null {
  if (!deadlineIso) return null;
  const now = new Date();
  const deadline = new Date(deadlineIso);
  if (deadline <= now) return 0;
  let bd = 0;
  const cur = new Date(now);
  while (cur < deadline) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) bd++;
  }
  return bd;
}

export function buildSubject(input: RenderInput): string {
  const { day, date } = fmtDayDate(input.reportDate);
  const prod = input.computed.productivity_pct;
  const n = input.variationFlags.length;
  const tail = n === 0 ? "" : `. ${n} variation${n === 1 ? "" : "s"} flagged`;
  return `${input.projectShortCode} wrap, ${day} ${date}. Productivity ${prod}%${tail}`;
}

export function renderHtml(input: RenderInput): string {
  const { computed, variationFlags, productivityNote, rawTranscript, dashboardBaseUrl } = input;
  const { day, date } = fmtDayDate(input.reportDate);

  const stat = (label: string, value: string, color = "#0f172a") => `
    <td style="padding:14px 16px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;text-align:center;width:25%">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:6px">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${value}</div>
    </td>`;

  const marginColor = computed.margin_aud < 0 ? "#b91c1c" : "#15803d";
  const prodColor = computed.productivity_pct < 80 ? "#b45309" : "#15803d";

  const worksRows = computed.works.map((w) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(`${w.from_pit ?? ""}${w.to_pit ? " to " + w.to_pit : ""}`)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(w.description ?? `BOQ ${w.boq_ref}`)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${w.quantity}${w.unit ? " " + escapeHtml(w.unit) : ""}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${w.pct_complete}%</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${fmtAUD(w.line_revenue)}</td>
    </tr>`).join("") || `<tr><td colspan="5" style="padding:10px;color:#6b7280;font-size:13px">No works logged.</td></tr>`;

  const crewRows = computed.crew.map((c) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(c.name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(c.classification_today)} (${escapeHtml(c.employment_type)})</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${c.hours_nt} NT / ${c.hours_ot} OT</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${fmtAUD(c.line_cost)}</td>
    </tr>`).join("") || `<tr><td colspan="4" style="padding:10px;color:#6b7280;font-size:13px">No crew logged.</td></tr>`;

  const plantRows = computed.plant.map((p) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(p.asset_name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escapeHtml(p.size_class ?? "")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${p.hours_nt} NT / ${p.hours_ot} OT</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${fmtAUD(p.line_cost)}</td>
    </tr>`).join("") || `<tr><td colspan="4" style="padding:10px;color:#6b7280;font-size:13px">No plant logged.</td></tr>`;

  const variationsBlock = variationFlags.length === 0 ? "" : `
    <h2 style="font-size:16px;margin:28px 0 10px;color:#0f172a">Variations flagged</h2>
    ${variationFlags.map((v) => {
      const bd = businessDaysUntil(v.deadline_at);
      const urgent = bd !== null && bd <= 1;
      const bdColor = urgent ? "#b91c1c" : "#0f172a";
      const bdText = bd === null ? "no deadline" : (bd === 0 ? "due today" : `${bd} BD left`);
      return `
        <div style="border:1px solid #e5e7eb;border-left:4px solid ${urgent ? "#b91c1c" : "#f59e0b"};border-radius:6px;padding:12px 14px;margin-bottom:10px;background:#fffbeb">
          <div style="font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(v.claim_type)} <span style="color:#6b7280;font-weight:400">(cl. ${escapeHtml(v.clause_ref)})</span></div>
          <div style="font-size:13px;color:#374151;margin-top:4px">"${escapeHtml(v.trigger_phrase ?? "")}"</div>
          <div style="font-size:12px;color:${bdColor};margin-top:6px">Notice deadline: <strong>${bdText}</strong>${v.duration_impact_hours != null ? ` &middot; ${v.duration_impact_hours}h impact` : ""}${v.symal_rep_saw ? " &middot; HC rep saw it" : ""} &middot; status: ${escapeHtml(v.status)}</div>
          <div style="margin-top:8px"><a href="${dashboardBaseUrl}/variations/${v.id}" style="font-size:12px;color:#1d4ed8;text-decoration:none">Review in dashboard &rarr;</a></div>
        </div>`;
    }).join("")}`;

  const noteBlock = productivityNote ? `
    <h2 style="font-size:16px;margin:28px 0 8px;color:#0f172a">Productivity note</h2>
    <p style="font-size:14px;color:#374151;margin:0;line-height:1.5">${escapeHtml(productivityNote)}</p>` : "";

  const transcriptBlock = rawTranscript ? `
    <details style="margin-top:32px">
      <summary style="cursor:pointer;font-size:13px;color:#6b7280">View transcript</summary>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-top:8px">${escapeHtml(rawTranscript)}</pre>
    </details>` : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(buildSubject(input))}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:680px;margin:0 auto;padding:28px 24px">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280">${escapeHtml(input.projectShortCode)} &middot; ${escapeHtml(input.supervisorName)}</div>
    <h1 style="font-size:22px;margin:6px 0 4px;color:#0f172a">Daily wrap, ${day} ${date}</h1>
    <div style="font-size:13px;color:#6b7280;margin-bottom:20px">${escapeHtml(input.projectName)}</div>

    <table role="presentation" cellpadding="0" cellspacing="6" style="width:100%;border-collapse:separate;margin-bottom:24px">
      <tr>
        ${stat("Revenue", fmtAUD(computed.revenue_aud))}
        ${stat("Cost", fmtAUD(computed.cost_aud))}
        ${stat("Margin", fmtAUD(computed.margin_aud), marginColor)}
        ${stat("Productivity", `${computed.productivity_pct}%`, prodColor)}
      </tr>
    </table>

    <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a">Works completed</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Pit</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">BOQ line</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Qty</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">% comp</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Revenue</th>
      </tr></thead>
      <tbody>${worksRows}</tbody>
    </table>

    <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a">Crew</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Name</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Classification</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Hours</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Cost</th>
      </tr></thead>
      <tbody>${crewRows}</tbody>
    </table>

    <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a">Plant</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Asset</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Size</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Hours</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Cost</th>
      </tr></thead>
      <tbody>${plantRows}</tbody>
    </table>

    ${variationsBlock}
    ${noteBlock}
    ${transcriptBlock}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
      PACC Civil &middot; auto-generated from supervisor wrap-up &middot; v0.1
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
