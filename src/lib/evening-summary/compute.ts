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
  plant: Array<PlantItemHours & { asset_name: string; size_class: string | null; nt_rate: number; ot_rate: number; line_cost: number }>;
};

export async function computeReport(reportId: string): Promise<ComputedReport> {
  const { data: report, error } = await supabaseAdmin
    .from("daily_reports")
    .select("id, project_id, works_completed, crew_hours, plant_hours")
    .eq("id", reportId)
    .single();
  if (error || !report) throw new Error(`report load failed: ${error?.message}`);

  const projectId = report.project_id as string;
  const works: WorkItem[] = Array.isArray(report.works_completed) ? (report.works_completed as any) : [];
  const crew: CrewItem[] = Array.isArray(report.crew_hours) ? (report.crew_hours as any) : [];
  const plant: PlantItemHours[] = Array.isArray(report.plant_hours) ? (report.plant_hours as any) : [];

  const [{ data: project }, { data: boq }, { data: crewReg }, { data: plantReg }, { data: classes }] = await Promise.all([
    supabaseAdmin.from("projects").select("expected_daily_revenue_aud").eq("id", projectId).single(),
    supabaseAdmin.from("boq_lines").select("ref, rate, description").eq("project_id", projectId),
    supabaseAdmin.from("crew_members").select("name, employment_type").eq("project_id", projectId),
    supabaseAdmin.from("plant_items").select("plant_id_code, description, tonnage_class").eq("project_id", projectId),
    supabaseAdmin.from("classifications").select("classification, employment_type, nt_cost_per_hr, ot_cost_per_hr"),
  ]);

  const boqByRef = new Map((boq ?? []).map((b: any) => [String(b.ref), b]));
  const crewByName = new Map((crewReg ?? []).map((c: any) => [c.name, c]));
  const plantByCode = new Map((plantReg ?? []).map((p: any) => [p.plant_id_code, p]));
  const classesByKey = new Map(
    (classes ?? []).map((c: any) => [`${c.classification}::${c.employment_type}`, c]),
  );

  // Revenue: quantity × pct_complete × rate
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
    const cls = classesByKey.get(`${c.classification_today}::${empType}`)
      ?? classesByKey.get(`${c.classification_today}::Full Time`);
    const ntRate = Number(cls?.nt_cost_per_hr ?? 0);
    const otRate = Number(cls?.ot_cost_per_hr ?? 0);
    const lineCost = (Number(c.hours_nt ?? 0) * ntRate) + (Number(c.hours_ot ?? 0) * otRate);
    crewCost += lineCost;
    return { ...c, employment_type: empType, nt_rate: ntRate, ot_rate: otRate, line_cost: lineCost };
  });

  // Plant cost
  let plantCost = 0;
  const enrichedPlant = plant.map((p) => {
    const reg = plantByCode.get(p.plant_id);
    const desc: string = reg?.description ?? p.plant_id;
    const ntRate = Number(reg?.cost_rate_nt ?? 0);
    const otRate = Number(reg?.cost_rate_ot ?? 0);
    const lineCost = (Number(p.hours_nt ?? 0) * ntRate) + (Number(p.hours_ot ?? 0) * otRate);
    plantCost += lineCost;
    return { ...p, asset_name: desc, size_class: reg?.tonnage_class ?? null, nt_rate: ntRate, ot_rate: otRate, line_cost: lineCost };
  });

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

// Plant_items uses cost_rate_nt naming; pull it via a second query helper since
// the original select above didn't include cost_rate_*. Fix by re-selecting.
export async function fetchPlantCostRates(projectId: string) {
  const { data } = await supabaseAdmin
    .from("plant_items")
    .select("plant_id_code, description, tonnage_class, cost_rate_nt, cost_rate_ot")
    .eq("project_id", projectId);
  return data ?? [];
}
