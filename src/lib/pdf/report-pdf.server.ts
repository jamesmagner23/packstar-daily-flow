import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ReportKind = "project" | "crew" | "plant" | "all";

export type GenerateInput = {
  kind: ReportKind;
  from: string; // yyyy-mm-dd
  to: string;
  projectId?: string;
  crewName?: string;
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

function newCtx(pdf: PDFDocument, font: PDFFont, bold: PDFFont): Ctx {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  return { pdf, page, y: PAGE_H - MARGIN, font, bold };
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
}

function text(ctx: Ctx, s: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; x?: number } = {}) {
  const size = opts.size ?? 10;
  ensure(ctx, size + 4);
  ctx.page.drawText(s, {
    x: opts.x ?? MARGIN,
    y: ctx.y - size,
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])),
  });
  ctx.y -= size + 4;
}

function hr(ctx: Ctx) {
  ensure(ctx, 8);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.y -= 8;
}

function space(ctx: Ctx, n = 8) {
  ctx.y -= n;
}

function fmtAud(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n)}%`;
}
function fmtDate(s: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(s + "T00:00:00"));
}
function fmtDateLong(s: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(s + "T00:00:00"));
}

function drawRow(ctx: Ctx, cells: string[], widths: number[], opts: { bold?: boolean; size?: number; align?: ("left" | "right")[] } = {}) {
  const size = opts.size ?? 9;
  ensure(ctx, size + 6);
  const font = opts.bold ? ctx.bold : ctx.font;
  let x = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    const w = widths[i];
    const align = opts.align?.[i] ?? "left";
    const cell = cells[i] ?? "";
    const tw = font.widthOfTextAtSize(cell, size);
    const tx = align === "right" ? x + w - tw - 4 : x + 2;
    ctx.page.drawText(cell, { x: tx, y: ctx.y - size, size, font, color: rgb(0.15, 0.15, 0.15) });
    x += w;
  }
  ctx.y -= size + 6;
}

function drawKpis(ctx: Ctx, kpis: { label: string; value: string }[]) {
  ensure(ctx, 50);
  const cellW = (PAGE_W - 2 * MARGIN) / kpis.length;
  for (let i = 0; i < kpis.length; i++) {
    const x = MARGIN + i * cellW;
    ctx.page.drawText(kpis[i].value, { x, y: ctx.y - 18, size: 16, font: ctx.bold, color: rgb(0.1, 0.1, 0.1) });
    ctx.page.drawText(kpis[i].label.toUpperCase(), { x, y: ctx.y - 32, size: 7, font: ctx.font, color: rgb(0.5, 0.5, 0.5) });
  }
  ctx.y -= 44;
}

export async function generateReportPdf(input: GenerateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx = newCtx(pdf, font, bold);

  pdf.setTitle(`PACC HQ report — ${input.kind} ${input.from} to ${input.to}`);
  pdf.setAuthor("PACC HQ");

  // Title block
  text(ctx, "PACC HQ", { size: 16, bold: true });
  text(ctx, titleFor(input), { size: 12 });
  text(ctx, `${fmtDateLong(input.from)} → ${fmtDateLong(input.to)}`, { size: 9, color: [0.4, 0.4, 0.4] });
  hr(ctx);

  if (input.kind === "project") {
    await renderProject(ctx, input);
  } else if (input.kind === "crew") {
    await renderCrew(ctx, input);
  } else if (input.kind === "plant") {
    await renderPlant(ctx, input);
  } else {
    await renderAll(ctx, input);
  }

  // Footer on each page
  const pages = pdf.getPages();
  const stamp = `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · Page %p of %n`;
  pages.forEach((p, idx) => {
    const s = stamp.replace("%p", String(idx + 1)).replace("%n", String(pages.length));
    p.drawText(s, { x: MARGIN, y: 20, size: 7, font, color: rgb(0.55, 0.55, 0.55) });
  });

  return await pdf.save();
}

function titleFor(input: GenerateInput): string {
  switch (input.kind) {
    case "project": return "Project report";
    case "crew": return input.crewName ? `Crew report — ${input.crewName}` : "Crew report";
    case "plant": return "Plant & hire summary";
    case "all": return "All-projects summary";
  }
}

async function fetchReports(input: GenerateInput) {
  let q = supabaseAdmin
    .from("daily_reports")
    .select("id, report_date, project_id, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, crew_hours, plant_hours")
    .gte("report_date", input.from)
    .lte("report_date", input.to)
    .order("report_date", { ascending: true });
  if (input.projectId) q = q.eq("project_id", input.projectId);
  const { data } = await q;
  return data ?? [];
}

async function renderProject(ctx: Ctx, input: GenerateInput) {
  const reports = await fetchReports(input);
  const { data: project } = input.projectId
    ? await supabaseAdmin.from("projects").select("name, code, expected_daily_revenue_aud").eq("id", input.projectId).maybeSingle()
    : { data: null as any };

  if (project) {
    text(ctx, `${project.code ?? ""} · ${project.name ?? ""}`, { size: 11, bold: true });
    space(ctx, 4);
  }

  const totals = reports.reduce(
    (a, r) => {
      a.rev += Number(r.revenue_aud ?? 0);
      a.cost += Number(r.cost_aud ?? 0);
      a.margin += Number(r.margin_aud ?? 0);
      return a;
    },
    { rev: 0, cost: 0, margin: 0 },
  );
  const expected = Number(project?.expected_daily_revenue_aud ?? 5000) * reports.length;
  const gp = totals.rev > 0 ? (totals.margin / totals.rev) * 100 : null;
  const prod = expected > 0 ? (totals.rev / expected) * 100 : null;

  drawKpis(ctx, [
    { label: "Revenue", value: fmtAud(totals.rev) },
    { label: "Cost", value: fmtAud(totals.cost) },
    { label: "Margin", value: fmtAud(totals.margin) },
    { label: "GP %", value: fmtPct(gp) },
    { label: "Productivity", value: fmtPct(prod) },
  ]);
  space(ctx, 6);
  hr(ctx);

  text(ctx, "Daily breakdown", { size: 11, bold: true });
  space(ctx, 4);
  const widths = [70, 230, 80, 80, 55];
  drawRow(ctx, ["Date", "Notes", "Revenue", "Margin", "Prod"], widths, { bold: true, size: 8, align: ["left", "left", "right", "right", "right"] });
  hr(ctx);
  if (reports.length === 0) {
    text(ctx, "No reports in this range.", { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    for (const r of reports) {
      const works = Array.isArray(r.works_completed) ? (r.works_completed as any[]).length : 0;
      drawRow(
        ctx,
        [
          fmtDate(r.report_date),
          `${works} work line${works === 1 ? "" : "s"}`,
          fmtAud(Number(r.revenue_aud ?? 0)),
          fmtAud(Number(r.margin_aud ?? 0)),
          fmtPct(r.productivity_pct == null ? null : Number(r.productivity_pct)),
        ],
        widths,
        { size: 9, align: ["left", "left", "right", "right", "right"] },
      );
    }
  }
}

async function renderCrew(ctx: Ctx, input: GenerateInput) {
  const reports = await fetchReports(input);
  // Aggregate per person
  const perPerson = new Map<string, { ntH: number; otH: number; days: Set<string> }>();
  for (const r of reports) {
    const items = Array.isArray(r.crew_hours) ? (r.crew_hours as any[]) : [];
    for (const c of items) {
      const name = String(c?.name ?? "");
      if (!name) continue;
      if (input.crewName && name !== input.crewName) continue;
      const cur = perPerson.get(name) ?? { ntH: 0, otH: 0, days: new Set<string>() };
      cur.ntH += Number(c?.hours_nt ?? c?.nt_hours ?? 0);
      cur.otH += Number(c?.hours_ot ?? c?.ot_hours ?? 0);
      cur.days.add(r.report_date);
      perPerson.set(name, cur);
    }
  }

  let totalNt = 0, totalOt = 0;
  for (const v of perPerson.values()) { totalNt += v.ntH; totalOt += v.otH; }

  drawKpis(ctx, [
    { label: "People", value: String(perPerson.size) },
    { label: "NT hours", value: totalNt.toFixed(1) },
    { label: "OT hours", value: totalOt.toFixed(1) },
    { label: "Total hours", value: (totalNt + totalOt).toFixed(1) },
  ]);
  space(ctx, 6);
  hr(ctx);

  text(ctx, "Per person", { size: 11, bold: true });
  space(ctx, 4);
  const widths = [180, 60, 60, 60, 60, 95];
  drawRow(ctx, ["Name", "Days", "NT hrs", "OT hrs", "Total", "Avg hrs/day"], widths, { bold: true, size: 8, align: ["left", "right", "right", "right", "right", "right"] });
  hr(ctx);
  const sorted = [...perPerson.entries()].sort((a, b) => (b[1].ntH + b[1].otH) - (a[1].ntH + a[1].otH));
  if (sorted.length === 0) {
    text(ctx, "No crew hours in this range.", { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    for (const [name, v] of sorted) {
      const total = v.ntH + v.otH;
      const avg = v.days.size > 0 ? total / v.days.size : 0;
      drawRow(
        ctx,
        [name, String(v.days.size), v.ntH.toFixed(1), v.otH.toFixed(1), total.toFixed(1), avg.toFixed(1)],
        widths,
        { size: 9, align: ["left", "right", "right", "right", "right", "right"] },
      );
    }
  }

  // Daily breakdown if a single person
  if (input.crewName) {
    space(ctx, 10);
    hr(ctx);
    text(ctx, `Daily breakdown — ${input.crewName}`, { size: 11, bold: true });
    space(ctx, 4);
    const dw = [80, 100, 70, 70, 70];
    drawRow(ctx, ["Date", "Classification", "NT hrs", "OT hrs", "Total"], dw, { bold: true, size: 8, align: ["left", "left", "right", "right", "right"] });
    hr(ctx);
    for (const r of reports) {
      const items = Array.isArray(r.crew_hours) ? (r.crew_hours as any[]) : [];
      const row = items.find((c) => String(c?.name) === input.crewName);
      if (!row) continue;
      const nt = Number(row.hours_nt ?? row.nt_hours ?? 0);
      const ot = Number(row.hours_ot ?? row.ot_hours ?? 0);
      drawRow(ctx, [fmtDate(r.report_date), String(row.classification_today ?? "—"), nt.toFixed(1), ot.toFixed(1), (nt + ot).toFixed(1)], dw, { size: 9, align: ["left", "left", "right", "right", "right"] });
    }
  }
}

async function renderPlant(ctx: Ctx, input: GenerateInput) {
  const reports = await fetchReports(input);

  // Hours per code from daily reports
  const hoursByCode = new Map<string, { nt: number; ot: number; days: Set<string> }>();
  for (const r of reports) {
    const items = Array.isArray(r.plant_hours) ? (r.plant_hours as any[]) : [];
    for (const p of items) {
      const code = String(p?.plant_id ?? p?.plant_id_code ?? "");
      if (!code) continue;
      const cur = hoursByCode.get(code) ?? { nt: 0, ot: 0, days: new Set<string>() };
      cur.nt += Number(p?.hours_nt ?? p?.nt_hours ?? 0);
      cur.ot += Number(p?.hours_ot ?? p?.ot_hours ?? 0);
      cur.days.add(r.report_date);
      hoursByCode.set(code, cur);
    }
  }

  // Hire periods overlapping range
  let periodsQ = supabaseAdmin
    .from("plant_hire_periods")
    .select("plant_id_code, on_date, off_date, rate_basis, rate_snapshot, project_id")
    .lte("on_date", input.to);
  if (input.projectId) periodsQ = periodsQ.eq("project_id", input.projectId);
  const { data: periodsRaw } = await periodsQ;
  const periods = (periodsRaw ?? []).filter((p) => !p.off_date || p.off_date >= input.from);

  const plantCodes = new Set<string>([...hoursByCode.keys(), ...periods.map((p) => p.plant_id_code)]);
  const codeArr = Array.from(plantCodes);
  const { data: plantReg } = codeArr.length
    ? await supabaseAdmin.from("plant_items").select("plant_id_code, description, tonnage_class, cost_rate_nt, cost_rate_ot, rate_basis, daily_rate, weekly_rate").in("plant_id_code", codeArr)
    : { data: [] as any[] };
  const regByCode = new Map((plantReg ?? []).map((p: any) => [p.plant_id_code, p]));

  // Compute cost per code over the range
  const fromD = new Date(input.from + "T00:00:00Z").getTime();
  const toD = new Date(input.to + "T00:00:00Z").getTime();
  const periodsByCode = new Map<string, any[]>();
  for (const p of periods) {
    const arr = periodsByCode.get(p.plant_id_code) ?? [];
    arr.push(p);
    periodsByCode.set(p.plant_id_code, arr);
  }

  type Line = { code: string; desc: string; basis: string; days: number; ntH: number; otH: number; cost: number };
  const lines: Line[] = [];
  let grandCost = 0;
  for (const code of codeArr) {
    const reg: any = regByCode.get(code);
    const basis = String(reg?.rate_basis ?? "hourly");
    const h = hoursByCode.get(code) ?? { nt: 0, ot: 0, days: new Set<string>() };
    let cost = 0;
    let hireDays = 0;

    if (basis === "hourly") {
      cost = h.nt * Number(reg?.cost_rate_nt ?? 0) + h.ot * Number(reg?.cost_rate_ot ?? 0);
    } else {
      // daily / weekly — sum days on-hire in range
      const ps = periodsByCode.get(code) ?? [];
      for (const pr of ps) {
        const onMs = Math.max(new Date(pr.on_date + "T00:00:00Z").getTime(), fromD);
        const offMs = Math.min(pr.off_date ? new Date(pr.off_date + "T00:00:00Z").getTime() : toD, toD);
        if (offMs < onMs) continue;
        const days = Math.round((offMs - onMs) / 86400000) + 1;
        hireDays += days;
        const rate = pr.rate_snapshot != null ? Number(pr.rate_snapshot) : Number(basis === "daily" ? reg?.daily_rate ?? 0 : reg?.weekly_rate ?? 0);
        if (basis === "daily") cost += rate * days;
        else cost += (rate / 7) * days;
      }
    }
    grandCost += cost;
    lines.push({
      code,
      desc: reg?.description ?? code,
      basis,
      days: basis === "hourly" ? h.days.size : hireDays,
      ntH: h.nt,
      otH: h.ot,
      cost,
    });
  }
  lines.sort((a, b) => b.cost - a.cost);

  drawKpis(ctx, [
    { label: "Items", value: String(lines.length) },
    { label: "Total cost", value: fmtAud(grandCost) },
    { label: "NT hrs", value: lines.reduce((a, l) => a + l.ntH, 0).toFixed(1) },
    { label: "OT hrs", value: lines.reduce((a, l) => a + l.otH, 0).toFixed(1) },
  ]);
  space(ctx, 6);
  hr(ctx);

  text(ctx, "Items", { size: 11, bold: true });
  space(ctx, 4);
  const widths = [70, 200, 55, 50, 55, 55, 30];
  drawRow(ctx, ["Code", "Description", "Basis", "Days", "NT hrs", "OT hrs", "Cost"], [70, 200, 55, 50, 55, 55, 30 + 70], { bold: true, size: 8, align: ["left", "left", "left", "right", "right", "right", "right"] });
  hr(ctx);
  if (lines.length === 0) {
    text(ctx, "No plant or hire activity in this range.", { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    for (const l of lines) {
      drawRow(
        ctx,
        [l.code, l.desc, l.basis, String(l.days), l.ntH.toFixed(1), l.otH.toFixed(1), fmtAud(l.cost)],
        [70, 200, 55, 50, 55, 55, 100],
        { size: 9, align: ["left", "left", "left", "right", "right", "right", "right"] },
      );
    }
  }
}

async function renderAll(ctx: Ctx, input: GenerateInput) {
  const reports = await fetchReports({ ...input, projectId: undefined });
  const { data: projects } = await supabaseAdmin.from("projects").select("id, code, name, expected_daily_revenue_aud");
  const projById = new Map((projects ?? []).map((p: any) => [p.id, p]));

  const perProject = new Map<string, { rev: number; cost: number; margin: number; days: Set<string> }>();
  for (const r of reports) {
    const pid = String(r.project_id ?? "");
    const cur = perProject.get(pid) ?? { rev: 0, cost: 0, margin: 0, days: new Set<string>() };
    cur.rev += Number(r.revenue_aud ?? 0);
    cur.cost += Number(r.cost_aud ?? 0);
    cur.margin += Number(r.margin_aud ?? 0);
    cur.days.add(r.report_date);
    perProject.set(pid, cur);
  }

  const totalRev = [...perProject.values()].reduce((a, p) => a + p.rev, 0);
  const totalCost = [...perProject.values()].reduce((a, p) => a + p.cost, 0);
  const totalMargin = totalRev - totalCost;
  const gp = totalRev > 0 ? (totalMargin / totalRev) * 100 : null;

  drawKpis(ctx, [
    { label: "Projects", value: String(perProject.size) },
    { label: "Revenue", value: fmtAud(totalRev) },
    { label: "Cost", value: fmtAud(totalCost) },
    { label: "Margin", value: fmtAud(totalMargin) },
    { label: "GP %", value: fmtPct(gp) },
  ]);
  space(ctx, 6);
  hr(ctx);

  text(ctx, "Per project", { size: 11, bold: true });
  space(ctx, 4);
  const widths = [60, 180, 50, 80, 80, 65];
  drawRow(ctx, ["Code", "Project", "Days", "Revenue", "Margin", "GP %"], widths, { bold: true, size: 8, align: ["left", "left", "right", "right", "right", "right"] });
  hr(ctx);
  const rows = [...perProject.entries()].sort((a, b) => b[1].rev - a[1].rev);
  if (rows.length === 0) {
    text(ctx, "No reports in this range.", { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    for (const [pid, v] of rows) {
      const p: any = projById.get(pid);
      const pgp = v.rev > 0 ? (v.margin / v.rev) * 100 : null;
      drawRow(
        ctx,
        [p?.code ?? "—", p?.name ?? "—", String(v.days.size), fmtAud(v.rev), fmtAud(v.margin), fmtPct(pgp)],
        widths,
        { size: 9, align: ["left", "left", "right", "right", "right", "right"] },
      );
    }
  }
}
