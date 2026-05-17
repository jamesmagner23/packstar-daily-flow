import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WorkItem = {
  from_pit?: string;
  to_pit?: string | null;
  boq_ref: string;
  material?: string;
  diameter_mm?: number;
  depth_band_m?: number;
  unit?: string;
  quantity: number;
  pct_complete: number;
};

export type CrewItem = {
  name: string;
  hours_nt: number;
  hours_ot: number;
  classification_today: string;
};

export type PlantItemHours = {
  plant_id: string;
  hours_nt: number;
  hours_ot: number;
};

export type ComputedReport = {
  revenue_aud: number;
  cost_aud: number;
  margin_aud: number;
  productivity_pct: number;
  expected_daily_revenue_aud: number;
  works: Array<WorkItem & { rate: number; line_revenue: number; description?: string }>;
  crew: Array<CrewItem & { employment_type: string; nt_rate: number; ot_rate: number; line_cost: number }>;
  plant: Array<
    PlantItemHours & {
      asset_name: string;
      size_class: string | null;
      nt_rate: number;
      ot_rate: number;
      line_cost: number;
      basis: "hourly" | "daily" | "weekly";
      basis_note?: string;
    }
  >;
};

export async function computeReport(reportId: string): Promise<ComputedReport> {
  const { data: report, error } = await supabaseAdmin
    .from("daily_reports")
    .select("id, project_id, report_date, works_completed, crew_hours, plant_hours")
    .eq("id", reportId)
    .single();
  if (error || !report) throw new Error(`report load failed: ${error?.message}`);

  const projectId = report.project_id as string;
  const reportDate = report.report_date as string;
  const works: WorkItem[] = Array.isArray(report.works_completed) ? (report.works_completed as any) : [];
  const crew: CrewItem[] = Array.isArray(report.crew_hours) ? (report.crew_hours as any) : [];
  const plant: PlantItemHours[] = Array.isArray(report.plant_hours) ? (report.plant_hours as any) : [];

  const [
    { data: project },
    { data: boq },
    { data: crewReg },
    { data: plantReg },
    { data: classes },
    { data: hirePeriods },
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("expected_daily_revenue_aud").eq("id", projectId).single(),
    supabaseAdmin.from("boq_lines").select("ref, rate, description").eq("project_id", projectId),
    supabaseAdmin.from("crew_members").select("name, employment_type").eq("project_id", projectId),
    supabaseAdmin
      .from("plant_items")
      .select("plant_id_code, description, tonnage_class, cost_rate_nt, cost_rate_ot, rate_basis, daily_rate, weekly_rate")
      .eq("project_id", projectId),
    supabaseAdmin.from("classifications").select("classification, employment_type, nt_cost_per_hr, ot_cost_per_hr"),
    supabaseAdmin
      .from("plant_hire_periods")
      .select("plant_id_code, on_date, off_date, rate_basis, rate_snapshot")
      .eq("project_id", projectId)
      .lte("on_date", reportDate),
  ]);

  const boqByRef = new Map((boq ?? []).map((b: any) => [String(b.ref), b]));
  const crewByName = new Map((crewReg ?? []).map((c: any) => [c.name, c]));
  const plantByCode = new Map((plantReg ?? []).map((p: any) => [p.plant_id_code, p]));
  const classesByKey = new Map(
    (classes ?? []).map((c: any) => [`${c.classification}::${c.employment_type}`, c]),
  );

  // Revenue
  let revenue = 0;
  const enrichedWorks = works.map((w) => {
    const line = boqByRef.get(String(w.boq_ref));
    const rate = Number(line?.rate ?? 0);
    const qty = Number(w.quantity ?? 0);
    const pct = Number(w.pct_complete ?? 0) / 100;
    const lineRev = qty * pct * rate;
    revenue += lineRev;
    return { ...w, rate, line_revenue: lineRev, description: line?.description };
  });

  // Crew cost
  let crewCost = 0;
  const enrichedCrew = crew.map((c) => {
    const reg = crewByName.get(c.name);
    const empType: string = reg?.employment_type ?? "Full Time";
    const cls =
      classesByKey.get(`${c.classification_today}::${empType}`) ??
      classesByKey.get(`${c.classification_today}::Full Time`);
    const ntRate = Number(cls?.nt_cost_per_hr ?? 0);
    const otRate = Number(cls?.ot_cost_per_hr ?? 0);
    const lineCost = Number(c.hours_nt ?? 0) * ntRate + Number(c.hours_ot ?? 0) * otRate;
    crewCost += lineCost;
    return { ...c, employment_type: empType, nt_rate: ntRate, ot_rate: otRate, line_cost: lineCost };
  });

  // Hire periods indexed by plant_id_code, active-on-date
  const reportDay = new Date(reportDate + "T00:00:00Z");
  const periodsByCode = new Map<string, Array<{ on: Date; off: Date | null; basis: string; rate: number | null }>>();
  for (const p of hirePeriods ?? []) {
    const arr = periodsByCode.get(p.plant_id_code) ?? [];
    arr.push({
      on: new Date(p.on_date + "T00:00:00Z"),
      off: p.off_date ? new Date(p.off_date + "T00:00:00Z") : null,
      basis: p.rate_basis,
      rate: p.rate_snapshot != null ? Number(p.rate_snapshot) : null,
    });
    periodsByCode.set(p.plant_id_code, arr);
  }
  const activePeriodOn = (code: string) => {
    const arr = periodsByCode.get(code) ?? [];
    return arr.find((pr) => pr.on <= reportDay && (pr.off === null || pr.off >= reportDay)) ?? null;
  };

  // Plant: union of mentioned-today (plant array) and any item on-hire today (daily/weekly).
  const mentionedCodes = new Set(plant.map((p) => p.plant_id));
  const onHireCodes = new Set<string>();
  for (const [code, arr] of periodsByCode) {
    if (arr.some((pr) => pr.on <= reportDay && (pr.off === null || pr.off >= reportDay))) {
      const reg = plantByCode.get(code);
      const basis = (reg?.rate_basis ?? "hourly") as string;
      if (basis === "daily" || basis === "weekly") onHireCodes.add(code);
    }
  }
  const allCodes = new Set<string>([...mentionedCodes, ...onHireCodes]);

  let plantCost = 0;
  const enrichedPlant: ComputedReport["plant"] = [];
  for (const code of allCodes) {
    const reg = plantByCode.get(code);
    const desc: string = reg?.description ?? code;
    const basis = ((reg?.rate_basis ?? "hourly") as "hourly" | "daily" | "weekly");
    const hours = plant.find((p) => p.plant_id === code) ?? { plant_id: code, hours_nt: 0, hours_ot: 0 };
    const ntRate = Number(reg?.cost_rate_nt ?? 0);
    const otRate = Number(reg?.cost_rate_ot ?? 0);

    let lineCost = 0;
    let basisNote: string | undefined;

    if (basis === "hourly") {
      lineCost = Number(hours.hours_nt ?? 0) * ntRate + Number(hours.hours_ot ?? 0) * otRate;
    } else if (basis === "daily") {
      const period = activePeriodOn(code);
      if (period) {
        const rate = period.rate ?? Number(reg?.daily_rate ?? 0);
        lineCost = rate;
        basisNote = `Daily hire @ $${rate.toFixed(2)}/day`;
      }
    } else if (basis === "weekly") {
      const period = activePeriodOn(code);
      if (period) {
        const weekly = period.rate ?? Number(reg?.weekly_rate ?? 0);
        // Pro-rate over 7 days so each report day carries a fair share.
        const perDay = weekly / 7;
        lineCost = perDay;
        basisNote = `Weekly hire @ $${weekly.toFixed(2)}/wk (≈ $${perDay.toFixed(2)}/day)`;
      }
    }

    plantCost += lineCost;
    enrichedPlant.push({
      plant_id: code,
      hours_nt: Number(hours.hours_nt ?? 0),
      hours_ot: Number(hours.hours_ot ?? 0),
      asset_name: desc,
      size_class: reg?.tonnage_class ?? null,
      nt_rate: ntRate,
      ot_rate: otRate,
      line_cost: lineCost,
      basis,
      basis_note: basisNote,
    });
  }

  const cost = crewCost + plantCost;
  const margin = revenue - cost;
  const expected = Number(project?.expected_daily_revenue_aud ?? 5000) || 5000;
  const productivity = expected > 0 ? Math.round((revenue / expected) * 100) : 0;

  return {
    revenue_aud: round2(revenue),
    cost_aud: round2(cost),
    margin_aud: round2(margin),
    productivity_pct: productivity,
    expected_daily_revenue_aud: expected,
    works: enrichedWorks,
    crew: enrichedCrew,
    plant: enrichedPlant,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
