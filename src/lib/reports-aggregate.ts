// Pure client-side aggregation helpers over daily_reports rows.

type DailyReportRow = {
  id: string;
  report_date: string;
  supervisor_id: string | null;
  revenue_aud: number | null;
  cost_aud: number | null;
  margin_aud: number | null;
  productivity_pct: number | null;
  works_completed: unknown;
  plant_hours: unknown;
};

type BoqLineLite = { ref: string; rate: number | null; description: string | null };
type PlantLite = { plant_id_code: string; description: string | null };

export type KpiTotals = {
  revenue: number;
  cost: number;
  margin: number;
  gpPct: number | null;
  productivityPct: number | null;
  marginVsTargetPct: number | null;
  reportCount: number;
};

export function aggregateKpis(
  reports: DailyReportRow[],
  expectedDailyRevenue: number,
  workingDays: number,
): KpiTotals {
  const revenue = sum(reports.map((r) => Number(r.revenue_aud ?? 0)));
  const cost = sum(reports.map((r) => Number(r.cost_aud ?? 0)));
  const margin = sum(reports.map((r) => Number(r.margin_aud ?? 0)));
  const gpPct = revenue > 0 ? (margin / revenue) * 100 : null;
  const expected = expectedDailyRevenue * Math.max(workingDays, 1);
  const productivityPct = expected > 0 ? (revenue / expected) * 100 : null;
  const marginVsTargetPct = expected > 0 ? (margin / expected) * 100 : null;
  return { revenue, cost, margin, gpPct, productivityPct, marginVsTargetPct, reportCount: reports.length };
}

export type BoqContribution = {
  boq_ref: string;
  description: string | null;
  revenue: number;
  quantity: number;
  rate: number | null;
};

export function aggregateBoqRevenue(
  reports: DailyReportRow[],
  boq: BoqLineLite[],
): BoqContribution[] {
  const byRef = new Map(boq.map((b) => [String(b.ref), b]));
  const acc = new Map<string, BoqContribution>();
  for (const r of reports) {
    const works = Array.isArray(r.works_completed) ? (r.works_completed as any[]) : [];
    for (const w of works) {
      const ref = String(w?.boq_ref ?? "");
      if (!ref) continue;
      const line = byRef.get(ref);
      const rate = Number(line?.rate ?? 0);
      const qty = Number(w?.quantity ?? 0);
      const pct = Number(w?.pct_complete ?? w?.stage_pct_added ?? 0) / 100;
      const lineRev = qty * pct * rate;
      const cur = acc.get(ref) ?? {
        boq_ref: ref,
        description: line?.description ?? null,
        revenue: 0,
        quantity: 0,
        rate: line?.rate ?? null,
      };
      cur.revenue += lineRev;
      cur.quantity += qty * pct;
      acc.set(ref, cur);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.revenue - a.revenue);
}

export type PlantHireStreak = {
  plant_id: string;
  description: string | null;
  first_seen: string;
  last_seen: string;
  active_days: number;
  span_days: number;
};

// Longest streak per plant_id across all rows; tolerates gaps up to maxGapDays.
export function detectLongHire(
  reports: DailyReportRow[],
  plantReg: PlantLite[],
  minSpanDays: number = 28,
  maxGapDays: number = 3,
): PlantHireStreak[] {
  const regByCode = new Map(plantReg.map((p) => [p.plant_id_code, p]));
  // Build sorted unique dates per plant
  const datesByPlant = new Map<string, Set<string>>();
  for (const r of reports) {
    const items = Array.isArray(r.plant_hours) ? (r.plant_hours as any[]) : [];
    for (const it of items) {
      const id = String(it?.plant_id ?? "");
      if (!id) continue;
      if (!datesByPlant.has(id)) datesByPlant.set(id, new Set());
      datesByPlant.get(id)!.add(r.report_date);
    }
  }

  const result: PlantHireStreak[] = [];
  for (const [plantId, dateSet] of datesByPlant) {
    const dates = Array.from(dateSet).sort();
    if (dates.length === 0) continue;
    // walk from end; collapse gaps <= maxGapDays into single span
    let spanStart = dates[0];
    let spanEnd = dates[0];
    let best: { start: string; end: string; active: number } | null = null;
    let active = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const cur = new Date(dates[i]);
      const gap = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      if (gap <= maxGapDays + 1) {
        spanEnd = dates[i];
        active += 1;
      } else {
        const days = daysBetween(spanStart, spanEnd) + 1;
        if (!best || days > daysBetween(best.start, best.end) + 1) {
          best = { start: spanStart, end: spanEnd, active };
        }
        spanStart = dates[i];
        spanEnd = dates[i];
        active = 1;
      }
    }
    const finalDays = daysBetween(spanStart, spanEnd) + 1;
    if (!best || finalDays > daysBetween(best.start, best.end) + 1) {
      best = { start: spanStart, end: spanEnd, active };
    }
    const span = daysBetween(best.start, best.end) + 1;
    if (span >= minSpanDays) {
      const reg = regByCode.get(plantId);
      result.push({
        plant_id: plantId,
        description: reg?.description ?? null,
        first_seen: best.start,
        last_seen: best.end,
        active_days: best.active,
        span_days: span,
      });
    }
  }
  return result.sort((a, b) => b.span_days - a.span_days);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
