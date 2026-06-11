import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Sun, Cloud, CloudRain, CloudLightning,
  UserCog, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";


export const Route = createFileRoute("/allocations")({
  head: () => ({ meta: [{ title: "Allocations — PACC HQ" }] }),
  component: AllocationsPage,
});

// ---------- locked light palette ----------
const C = {
  brand: "#DC3D3F",
  brandDeep: "#C8333A",
  ink: "#1A1A1A",
  meta: "#4A4A4A",
  rule: "#E5E5E5",
  surface: "#FFFFFF",
  page: "#F1EFE8",
  chip: "#F1EFE8",
  green: "#22c55e",
  blue: "#185FA5",
  amber: "#BA7517",
  teal: "#0F6E56",
  okBg: "#EAF3DE", okFg: "#173404",
  badBg: "#FCEBEB", badFg: "#791F1F", badBorder: "#F09595", badDeep: "#A32D2D", badDeeper: "#501313",
};
const POPPINS = "Poppins, ui-sans-serif, system-ui";

// ---------- date helpers ----------
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function startOfWeek(d: Date) {
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}
const fmtLong = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);

// Normalise free-form crew employment_type into the values allowed by the
// daily_allocations.employment_type check constraint.
function normEmployment(v: string | null | undefined): "employee" | "casual" | "subcontractor" {
  const s = (v ?? "").toLowerCase().trim();
  if (s.startsWith("sub")) return "subcontractor";
  if (s.startsWith("cas")) return "casual";
  return "employee"; // employee, full time, office, blank, etc.
}


// ---------- types (loose; integration types may not yet include new tables) ----------
type Crew = { id: string; name: string; employment_type: string | null };
type Project = {
  id: string; code: string; name: string; head_contractor: string | null;
  work_type: string | null; latitude: number | null; longitude: number | null;
};
type Classification = { id: string; code: string | null; classification: string };
type PlantItem = { id: string; plant_id_code: string; name: string | null; description: string | null; type: string | null };
type Allocation = {
  id: string; allocation_date: string; person_id: string; job_id: string;
  classification_id: string | null; plant_item_id: string | null; plant_asset_ids: string[] | null;
  supervisor_id: string | null; status: string; source: string;
  employment_type: string | null; planned_hours: number | null; actual_hours: number | null;
  notes: string | null;
};
type Requirement = {
  id: string; project_id: string; requirement_type: "classification" | "plant_type";
  classification_id: string | null; plant_type: string | null; required_count: number; active: boolean;
};
type Forecast = {
  project_id: string; forecast_date: string;
  temp_max_c: number | null; rain_probability_pct: number | null;
  weather_code: string | null;
};
type WorkType = { id: string; code: string; description: string };
type ProjectSupervisor = { project_id: string; supervisor_id: string };

type View = "today" | "week" | "month" | "person" | "plant";

// ---------- page ----------
function AllocationsPage() {
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [view, setView] = useState<View>("today");
  const isoD = isoDate(date);

  const [modal, setModal] = useState<
    | { mode: "create"; project_id?: string; person_id?: string; date: string }
    | { mode: "edit"; allocation: Allocation }
    | null
  >(null);
  const [planner, setPlanner] = useState(false);
  const [quickEdit, setQuickEdit] = useState<{ a: Allocation; rect: DOMRect } | null>(null);

  // base lookups
  const crewQ = useQuery({
    queryKey: ["v2-crew"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crew_members")
        .select("id, name, employment_type").eq("active", true).order("name");
      if (error) throw error; return (data ?? []) as Crew[];
    },
  });
  const projectsQ = useQuery({
    queryKey: ["v2-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects")
        .select("id, code, name, head_contractor, work_type, latitude, longitude")
        .eq("active", true).order("code");
      if (error) throw error; return (data ?? []) as Project[];
    },
  });
  const classQ = useQuery({
    queryKey: ["v2-class"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classifications")
        .select("id, code, classification").eq("active", true).order("code");
      if (error) throw error; return (data ?? []) as Classification[];
    },
  });
  const plantQ = useQuery({
    queryKey: ["v2-plant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plant_items")
        .select("id, plant_id_code, name, description, type").eq("active", true).order("plant_id_code");
      if (error) throw error; return (data ?? []) as PlantItem[];
    },
  });
  const workTypesQ = useQuery({
    queryKey: ["v2-worktypes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("work_types")
        .select("id, code, description").eq("active", true).order("display_order");
      if (error) throw error; return (data ?? []) as WorkType[];
    },
  });
  const supervisorsQ = useQuery({
    queryKey: ["v2-projsupers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("project_supervisors")
        .select("project_id, supervisor_id");
      if (error) throw error; return (data ?? []) as ProjectSupervisor[];
    },
  });

  // date-scoped data
  const allocQ = useQuery({
    queryKey: ["v2-alloc", isoD],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_allocations")
        .select("id, allocation_date, person_id, job_id, classification_id, plant_item_id, plant_asset_ids, supervisor_id, status, source, employment_type, planned_hours, actual_hours, notes")
        .eq("allocation_date", isoD);
      if (error) throw error; return (data ?? []) as Allocation[];
    },
  });
  const reqsQ = useQuery({
    queryKey: ["v2-reqs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("project_requirements")
        .select("id, project_id, requirement_type, classification_id, plant_type, required_count, active")
        .eq("active", true);
      if (error) throw error; return (data ?? []) as Requirement[];
    },
  });
  const weatherQ = useQuery({
    queryKey: ["v2-weather", isoD],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("weather_forecasts")
        .select("project_id, forecast_date, temp_max_c, rain_probability_pct, weather_code")
        .eq("forecast_date", isoD);
      if (error) throw error; return (data ?? []) as Forecast[];
    },
  });
  const inductionsQ = useQuery({
    queryKey: ["v2-inductions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("person_inductions")
        .select("person_id, status, expires_date");
      if (error) throw error;
      return (data ?? []) as { person_id: string; status: string; expires_date: string | null }[];
    },
  });

  return (
    <SiteShell section="Allocations">
      <div style={{ background: "#F1EFE8", colorScheme: "light", color: C.ink, fontFamily: POPPINS }} className="-mx-4 -my-6 p-[14px] md:-mx-8 min-h-screen">
        <Header date={date} setDate={setDate} view={view} setView={setView} onPlanWeek={() => setPlanner(true)} />

        {view === "today" && (
          <TodayView
            date={date}
            projects={projectsQ.data ?? []}
            crew={crewQ.data ?? []}
            classifications={classQ.data ?? []}
            plant={plantQ.data ?? []}
            workTypes={workTypesQ.data ?? []}
            allocations={allocQ.data ?? []}
            reqs={reqsQ.data ?? []}
            weather={weatherQ.data ?? []}
            inductions={inductionsQ.data ?? []}
            projectSupervisors={supervisorsQ.data ?? []}
            onAdd={(project_id) => setModal({ mode: "create", project_id, date: isoD })}
            onEdit={(a) => setModal({ mode: "edit", allocation: a })}
          />
        )}
        {view === "week" && <WeekView date={date} setDate={setDate} setView={setView} projects={projectsQ.data ?? []} />}
        {view === "month" && <MonthView date={date} setDate={setDate} setView={setView} projects={projectsQ.data ?? []} />}
        {view === "person" && (
          <PersonView
            weekStart={startOfWeek(date)}
            crew={crewQ.data ?? []}
            projects={projectsQ.data ?? []}
            classifications={classQ.data ?? []}
            plant={plantQ.data ?? []}
            onCell={(person_id, d) => setModal({ mode: "create", person_id, date: d })}
            onEdit={(a, rect) => setQuickEdit({ a, rect })}
          />
        )}
        {view === "plant" && (
          <PlantView
            weekStart={startOfWeek(date)}
            plant={plantQ.data ?? []}
            projects={projectsQ.data ?? []}
            crew={crewQ.data ?? []}
            onEdit={(a, rect) => setQuickEdit({ a, rect })}
          />
        )}

        {/* FAB */}
        <button
          aria-label="Add allocation"
          onClick={() => setModal({ mode: "create", date: isoD })}
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg flex items-center justify-center"
          style={{ width: 56, height: 56, background: C.green, color: "white" }}
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      {modal && (
        <AllocationModal
          modal={modal}
          crew={crewQ.data ?? []}
          projects={projectsQ.data ?? []}
          classifications={classQ.data ?? []}
          plant={plantQ.data ?? []}
          onClose={() => setModal(null)}
        />
      )}
      {planner && (
        <WeekPlannerModal
          weekStart={startOfWeek(date)}
          crew={crewQ.data ?? []}
          projects={projectsQ.data ?? []}
          classifications={classQ.data ?? []}
          onClose={() => setPlanner(false)}
        />
      )}
      {quickEdit && (
        <QuickEditPopover
          allocation={quickEdit.a}
          anchor={quickEdit.rect}
          projects={projectsQ.data ?? []}
          classifications={classQ.data ?? []}
          onClose={() => setQuickEdit(null)}
          onFull={() => { setModal({ mode: "edit", allocation: quickEdit.a }); setQuickEdit(null); }}
        />
      )}
    </SiteShell>
  );
}

// ---------- header ----------
function Header({ date, setDate, view, setView, onPlanWeek }: { date: Date; setDate: (d: Date) => void; view: View; setView: (v: View) => void; onPlanWeek: () => void }) {
  return (
    <header className="mb-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ fontFamily: POPPINS, color: C.brand }}>
            Allocations
          </h1>
          <p className="mt-1 text-sm" style={{ color: C.meta }}>{fmtLong(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous" className="h-9 w-9 inline-flex items-center justify-center rounded-md border" style={{ borderColor: C.rule, background: C.surface, color: C.ink }}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d); }} className="h-9 px-3 text-xs uppercase tracking-[0.16em] font-semibold rounded-md border" style={{ borderColor: C.rule, background: C.surface, color: C.ink }}>
            Today
          </button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next" className="h-9 w-9 inline-flex items-center justify-center rounded-md border" style={{ borderColor: C.rule, background: C.surface, color: C.ink }}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={onPlanWeek} className="h-9 px-3 text-xs uppercase tracking-[0.16em] font-semibold rounded-md text-white" style={{ background: C.brand }}>
            + Plan week
          </button>
        </div>
      </div>

      <div className="inline-flex p-1 rounded-full self-start" style={{ background: C.chip }}>
        {(["today","week","month","person","plant"] as View[]).map((v) => {
          const active = view === v;
          return (
            <button key={v} onClick={() => setView(v)}
              className="px-4 h-8 text-xs uppercase tracking-[0.14em] font-semibold rounded-full transition"
              style={{ background: active ? C.brand : "transparent", color: active ? "#fff" : C.meta }}>
              {v}
            </button>
          );
        })}
      </div>
    </header>
  );
}

// ---------- weather ----------
function WeatherIcon({ code }: { code: string | null | undefined }) {
  const props = { className: "h-3.5 w-3.5", style: { color: C.blue } as React.CSSProperties };
  switch (code) {
    case "sunny": return <Sun {...props} />;
    case "cloudy":
    case "partly_cloudy": return <Cloud {...props} />;
    case "rain_light":
    case "rain_heavy": return <CloudRain {...props} />;
    case "storm": return <CloudLightning {...props} />;
    default: return <Cloud {...props} />;
  }
}
function dotColor(t: string | null | undefined) {
  if (t === "casual") return C.amber;
  if (t === "subcontractor") return C.teal;
  return C.blue;
}

// ---------- today ----------
function TodayView(props: {
  date: Date;
  projects: Project[]; crew: Crew[]; classifications: Classification[]; plant: PlantItem[];
  workTypes: WorkType[]; allocations: Allocation[]; reqs: Requirement[]; weather: Forecast[];
  inductions: { person_id: string; status: string; expires_date: string | null }[];
  projectSupervisors: ProjectSupervisor[];
  onAdd: (project_id: string) => void;
  onEdit: (a: Allocation) => void;
}) {
  const { projects, crew, classifications, plant, workTypes, allocations, reqs, weather, inductions, projectSupervisors, onAdd, onEdit, date } = props;
  const isoD = isoDate(date);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const crewMap = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const classMap = useMemo(() => new Map(classifications.map((c) => [c.id, c])), [classifications]);
  const plantMap = useMemo(() => new Map(plant.map((p) => [p.id, p])), [plant]);
  const wtMap = useMemo(() => new Map(workTypes.map((w) => [w.id, w])), [workTypes]);
  const weatherMap = useMemo(() => new Map(weather.map((w) => [w.project_id, w])), [weather]);

  // inducted = person has at least one completed induction not expired
  const inductedSet = useMemo(() => {
    const s = new Set<string>();
    inductions.forEach((i) => {
      if (i.status === "completed" && (!i.expires_date || i.expires_date >= isoD)) s.add(i.person_id);
    });
    return s;
  }, [inductions, isoD]);

  // group allocations + reqs by project
  const projIds = useMemo(() => {
    const s = new Set<string>();
    allocations.forEach((a) => s.add(a.job_id));
    reqs.forEach((r) => s.add(r.project_id));
    return Array.from(s);
  }, [allocations, reqs]);

  const cards = projIds
    .map((pid) => projectMap.get(pid))
    .filter((p): p is Project => !!p);

  // unassigned crew
  const assignedSet = new Set(allocations.map((a) => a.person_id));
  const unassigned = crew.filter((c) => !assignedSet.has(c.id));

  // supervisors lookup
  const supByProject = useMemo(() => {
    const m = new Map<string, string[]>();
    projectSupervisors.forEach((ps) => {
      const arr = m.get(ps.project_id) ?? [];
      arr.push(ps.supervisor_id);
      m.set(ps.project_id, arr);
    });
    return m;
  }, [projectSupervisors]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[10px]">
        {cards.map((p) => {
          const projAllocs = allocations.filter((a) => a.job_id === p.id);
          const projReqs = reqs.filter((r) => r.project_id === p.id);
          const totalHours = projAllocs.reduce((s, a) => s + (a.planned_hours ?? 0), 0);
          const wt = p.work_type ? wtMap.get(p.work_type) : null;
          const fc = weatherMap.get(p.id);
          const supIds = supByProject.get(p.id) ?? [];
          const supNames = supIds
            .map((id) => crewMap.get(id)?.name?.split(" ")[0])
            .filter(Boolean) as string[];

          return (
            <article key={p.id} style={{
              background: C.surface, border: `0.5px solid ${C.rule}`, borderLeft: `3px solid ${C.brand}`,
              borderRadius: 8, padding: "12px 14px", color: C.ink,
            }}>
              {/* header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 style={{ fontSize: 15, fontWeight: 500, color: C.ink }} className="truncate">{p.name}</h3>
                  <p style={{ fontSize: 11, color: C.meta }} className="truncate">
                    {(p.head_contractor ?? "—") + (wt ? ` · ${wt.description}` : "")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span style={{ background: C.chip, color: C.ink, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 999 }}>
                    {projAllocs.length} crew · {totalHours}h
                  </span>
                  {fc && (
                    <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: C.meta }}>
                      <WeatherIcon code={fc.weather_code} />
                      {fc.temp_max_c != null && <>{fc.temp_max_c}°</>}
                      {fc.rain_probability_pct != null && <> · {fc.rain_probability_pct}% rain</>}
                    </span>
                  )}
                </div>
              </div>

              {/* needs */}
              {projReqs.length > 0 && (
                <div style={{ borderTop: `0.5px solid ${C.rule}`, borderBottom: `0.5px solid ${C.rule}` }} className="mt-3 py-2 flex items-center flex-wrap gap-2">
                  <span style={{ fontSize: 10, color: C.meta, letterSpacing: "0.1em" }}>NEEDS</span>
                  {projReqs.map((r) => {
                    if (r.requirement_type === "classification") {
                      const code = classMap.get(r.classification_id ?? "")?.code ?? classMap.get(r.classification_id ?? "")?.classification ?? "—";
                      const have = projAllocs.filter((a) => a.classification_id === r.classification_id).length;
                      const ok = have >= r.required_count;
                      return <Pill key={r.id} ok={ok} label={ok ? `${code} ×${r.required_count} ✓` : `${code} ×${r.required_count - have} short`} />;
                    }
                    // plant_type
                    const have = projAllocs.reduce((s, a) => {
                      const ids = a.plant_asset_ids ?? [];
                      const matched = ids.filter((id) => plantMap.get(id)?.type === r.plant_type).length;
                      return s + matched;
                    }, 0);
                    const ok = have >= r.required_count;
                    return <Pill key={r.id} ok={ok} label={ok ? `${r.plant_type} ✓` : `${r.plant_type} short`} />;
                  })}
                </div>
              )}

              {/* crew grid */}
              {projAllocs.length > 0 && (
                <div className="mt-3" style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "7px 10px" }}>
                  {projAllocs.map((a) => {
                    const cm = crewMap.get(a.person_id);
                    const first = cm?.name?.split(" ")[0] ?? "—";
                    const empType = a.employment_type ?? cm?.employment_type ?? "employee";
                    const cls = a.classification_id ? classMap.get(a.classification_id) : null;
                    const clsCode = cls?.code ?? cls?.classification ?? "";
                    const plantNames = (a.plant_asset_ids ?? [])
                      .map((id) => plantMap.get(id)?.name ?? plantMap.get(id)?.plant_id_code)
                      .filter(Boolean) as string[];
                    const inducted = inductedSet.has(a.person_id);

                    return (
                      <div key={a.id} className="contents" >
                        <button onClick={() => onEdit(a)} className="flex items-center gap-[5px] text-left" style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor(empType), flexShrink: 0 }} />
                          <span>{first}</span>
                          {!inducted && (
                            <span title="Not inducted" style={{
                              width: 14, height: 14, borderRadius: 999, background: C.brand, color: "#fff",
                              fontSize: 10, lineHeight: "14px", textAlign: "center", fontWeight: 700, display: "inline-block",
                            }}>!</span>
                          )}
                        </button>
                        <button onClick={() => onEdit(a)} className="text-left self-center truncate" style={{ fontSize: 12, color: C.meta }}>
                          {clsCode}{plantNames.length ? ` · ${plantNames.join(" · ")}` : ""}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* add link */}
              <button onClick={() => onAdd(p.id)} className="mt-3 inline-flex items-center gap-1" style={{ color: C.green, fontSize: 12, fontWeight: 500 }}>
                + Add person or plant
              </button>

              {/* footer */}
              <div style={{ borderTop: `0.5px solid ${C.rule}` }} className="mt-3 pt-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: C.meta }}>
                  <UserCog style={{ width: 13, height: 13 }} />
                  {supNames.length ? supNames.join(", ") : "—"}
                </span>
                <span />
              </div>
            </article>
          );
        })}

        {cards.length === 0 && (
          <div className="col-span-full text-sm" style={{ color: C.meta }}>
            No allocations or requirements for {fmtLong(date)}.
          </div>
        )}

        {/* unassigned */}
        {unassigned.length > 0 && (
          <article className="md:col-span-2 xl:col-span-3" style={{
            background: C.badBg, border: `0.5px solid ${C.badBorder}`, borderRadius: 8, padding: "12px 14px",
          }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 style={{ fontSize: 13, fontWeight: 500, color: C.badFg }}>Unassigned</h3>
                <p style={{ fontSize: 11, color: C.badDeep }} className="mt-1">
                  {unassigned.map((u) => u.name).join(", ")}
                </p>
              </div>
              <span style={{ background: C.badBorder, color: C.badDeeper, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 999 }}>
                {unassigned.length} · Gap
              </span>
            </div>
          </article>
        )}
      </div>

      {/* legend */}
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap" style={{ fontSize: 10, color: C.meta }}>
        <LegendDot color={C.blue} label="employee" />
        <span>·</span>
        <LegendDot color={C.amber} label="casual" />
        <span>·</span>
        <LegendDot color={C.teal} label="sub" />
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <span style={{ width: 12, height: 12, borderRadius: 999, background: C.brand, color: "#fff", fontSize: 9, lineHeight: "12px", textAlign: "center", fontWeight: 700, display: "inline-block" }}>!</span>
          not inducted
        </span>
      </div>
    </>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      background: ok ? C.okBg : C.badBg, color: ok ? C.okFg : C.badFg,
      fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999,
    }}>{label}</span>
  );
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

// ---------- week shell ----------
function WeekView({ date, setDate, setView, projects }: {
  date: Date; setDate: (d: Date) => void; setView: (v: View) => void;
  projects: Project[];
}) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = isoDate(days[0]); const to = isoDate(days[6]);
  const q = useQuery({
    queryKey: ["v2-week-range", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_allocations")
        .select("id, allocation_date, job_id, planned_hours")
        .gte("allocation_date", from).lte("allocation_date", to);
      if (error) throw error;
      return (data ?? []) as { id: string; allocation_date: string; job_id: string; planned_hours: number | null }[];
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[10px]">
      {projects.map((p) => (
        <article key={p.id} style={{ background: C.surface, border: `0.5px solid ${C.rule}`, borderLeft: `3px solid ${C.brand}`, borderRadius: 8, padding: "12px 14px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: C.ink }} className="truncate">{p.name}</h3>
          <p style={{ fontSize: 11, color: C.meta }} className="truncate">{p.head_contractor ?? "—"}</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const iso = isoDate(d);
              const dayRows = rows.filter((a) => a.job_id === p.id && a.allocation_date === iso);
              const count = dayRows.length;
              const hours = dayRows.reduce((s, a) => s + (a.planned_hours ?? 0), 0);
              return (
                <button key={iso} onClick={() => { setDate(d); setView("today"); }}
                  className="rounded text-center py-1.5" style={{ background: count > 0 ? "#FFFFFF" : C.chip, color: C.ink, border: `0.5px solid ${C.rule}` }}>
                  <div style={{ fontSize: 9, color: C.meta }}>{d.toLocaleDateString("en-AU", { weekday: "short" }).slice(0,1)}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{count}</div>
                  <div style={{ fontSize: 9, color: C.meta }}>{hours ? `${hours}h` : "—"}</div>
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------- month shell ----------
function MonthView({ date, setDate, setView, projects }: {
  date: Date; setDate: (d: Date) => void; setView: (v: View) => void; projects: Project[];
}) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const days = Array.from({ length: last.getDate() }, (_, i) => addDays(first, i));
  const from = isoDate(first); const to = isoDate(last);
  const q = useQuery({
    queryKey: ["v2-month-range", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_allocations")
        .select("id, allocation_date, job_id")
        .gte("allocation_date", from).lte("allocation_date", to);
      if (error) throw error;
      return (data ?? []) as { id: string; allocation_date: string; job_id: string }[];
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[10px]">
      {projects.map((p) => (
        <article key={p.id} style={{ background: C.surface, border: `0.5px solid ${C.rule}`, borderLeft: `3px solid ${C.brand}`, borderRadius: 8, padding: "12px 14px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 500 }} className="truncate">{p.name}</h3>
          <p style={{ fontSize: 11, color: C.meta }} className="truncate">{p.head_contractor ?? "—"}</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const iso = isoDate(d);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const count = rows.filter((a) => a.job_id === p.id && a.allocation_date === iso).length;
              const bg = count > 0 ? "#FFFFFF" : (isWeekend ? "#D6D3CB" : C.chip);
              return (
                <button key={iso} onClick={() => { setDate(d); setView("today"); }}
                  className="rounded inline-flex items-center justify-center" style={{ height: 22, background: bg, border: `0.5px solid ${C.rule}`, fontSize: 10, fontWeight: 600, color: count > 0 ? C.ink : C.meta }} title={iso}>
                  {count > 0 ? count : d.getDate()}
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------- plant view ----------
function PlantView({ weekStart, plant, projects, crew, onEdit }: {
  weekStart: Date; plant: PlantItem[]; projects: Project[]; crew: Crew[];
  onEdit: (a: Allocation, rect: DOMRect) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = isoDate(days[0]); const to = isoDate(days[6]);
  const q = useQuery({
    queryKey: ["v2-plant-grid", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_allocations")
        .select("id, allocation_date, person_id, job_id, classification_id, plant_item_id, plant_asset_ids, supervisor_id, status, source, employment_type, planned_hours, actual_hours, notes")
        .gte("allocation_date", from).lte("allocation_date", to);
      if (error) throw error; return (data ?? []) as Allocation[];
    },
  });
  const projMap = new Map(projects.map((p) => [p.id, p]));
  const crewMap = new Map(crew.map((c) => [c.id, c]));
  const rows = q.data ?? [];

  return (
    <div style={{ background: C.surface, border: `0.5px solid ${C.rule}`, borderRadius: 8 }} className="overflow-x-auto">
      <table className="w-full text-xs border-collapse" style={{ fontFamily: POPPINS }}>
        <thead>
          <tr>
            <th className="sticky left-0 text-left px-3 py-2 font-semibold uppercase tracking-wider min-w-[180px]" style={{ background: "#F1EFE8", color: C.meta, borderBottom: `0.5px solid ${C.rule}`, borderRight: `0.5px solid ${C.rule}`, fontSize: 11 }}>
              Plant
            </th>
            {days.map((d) => (
              <th key={isoDate(d)} className="text-left px-3 py-2 font-semibold uppercase tracking-wider min-w-[150px]" style={{ color: C.meta, borderBottom: `0.5px solid ${C.rule}`, fontSize: 11 }}>
                {d.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plant.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: C.meta }}>No plant items.</td></tr>
          )}
          {plant.map((pl) => (
            <tr key={pl.id}>
              <td className="sticky left-0 px-3 py-2 align-top" style={{ background: C.surface, color: C.ink, borderBottom: `0.5px solid ${C.rule}`, borderRight: `0.5px solid ${C.rule}`, fontWeight: 500 }}>
                <div style={{ fontSize: 12 }}>{pl.plant_id_code ?? pl.name ?? "—"}</div>
                {pl.description && <div style={{ fontSize: 10, color: C.meta }} className="truncate">{pl.description}</div>}
              </td>
              {days.map((d) => {
                const iso = isoDate(d);
                const items = rows.filter((a) => a.allocation_date === iso && (a.plant_asset_ids ?? []).includes(pl.id));
                return (
                  <td key={iso} className="px-2 py-2 align-top" style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                    <div className="flex flex-col gap-1">
                      {items.map((a) => {
                        const code = projMap.get(a.job_id)?.code ?? "—";
                        const first = crewMap.get(a.person_id)?.name?.split(" ")[0] ?? "—";
                        return (
                          <button key={a.id} onClick={(e) => onEdit(a, (e.currentTarget as HTMLElement).getBoundingClientRect())} className="text-left rounded px-1.5 py-1" style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderLeft: `3px solid ${a.status === "actual" ? C.green : C.brand}` }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.ink }} className="truncate">{code}</div>
                            <div style={{ fontSize: 9, color: C.meta }} className="truncate">{first} · {a.planned_hours ?? 0}h</div>
                          </button>
                        );
                      })}
                      {items.length === 0 && (
                        <div style={{ height: 6 }} />
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- person view (restored grid) ----------
function PersonView({ weekStart, crew, projects, classifications, plant, onCell, onEdit }: {
  weekStart: Date; crew: Crew[]; projects: Project[]; classifications: Classification[]; plant: PlantItem[];
  onCell: (person_id: string, date: string) => void; onEdit: (a: Allocation, rect: DOMRect) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = isoDate(days[0]); const to = isoDate(days[6]);
  const q = useQuery({
    queryKey: ["v2-person-grid", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_allocations")
        .select("id, allocation_date, person_id, job_id, classification_id, plant_item_id, plant_asset_ids, supervisor_id, status, source, employment_type, planned_hours, actual_hours, notes")
        .gte("allocation_date", from).lte("allocation_date", to);
      if (error) throw error; return (data ?? []) as Allocation[];
    },
  });
  const projMap = new Map(projects.map((p) => [p.id, p]));
  const classMap = new Map(classifications.map((c) => [c.id, c]));
  const plantMap = new Map(plant.map((p) => [p.id, p]));
  const grid = new Map<string, Allocation[]>();
  (q.data ?? []).forEach((a) => {
    const k = `${a.person_id}|${a.allocation_date}`;
    const arr = grid.get(k) ?? []; arr.push(a); grid.set(k, arr);
  });

  return (
    <div style={{ background: C.surface, border: `0.5px solid ${C.rule}`, borderRadius: 8 }} className="overflow-x-auto">
      <table className="w-full text-xs border-collapse" style={{ fontFamily: POPPINS }}>
        <thead>
          <tr>
            <th className="sticky left-0 text-left px-3 py-2 font-semibold uppercase tracking-wider min-w-[160px]" style={{ background: "#F1EFE8", color: C.meta, borderBottom: `0.5px solid ${C.rule}`, borderRight: `0.5px solid ${C.rule}`, fontSize: 11 }}>
              Crew
            </th>
            {days.map((d) => (
              <th key={isoDate(d)} className="text-left px-3 py-2 font-semibold uppercase tracking-wider min-w-[150px]" style={{ color: C.meta, borderBottom: `0.5px solid ${C.rule}`, fontSize: 11 }}>
                {d.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crew.map((c) => (
            <tr key={c.id}>
              <td className="sticky left-0 px-3 py-2 align-top" style={{ background: C.surface, color: C.ink, borderBottom: `0.5px solid ${C.rule}`, borderRight: `0.5px solid ${C.rule}`, fontWeight: 500 }}>
                {c.name}
              </td>
              {days.map((d) => {
                const iso = isoDate(d);
                const items = grid.get(`${c.id}|${iso}`) ?? [];
                return (
                  <td key={iso} className="px-2 py-2 align-top" style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                    <div className="flex flex-col gap-1">
                      {items.map((a) => {
                        const code = projMap.get(a.job_id)?.code ?? "—";
                        const cls = a.classification_id ? classMap.get(a.classification_id) : null;
                        return (
                          <button key={a.id} onClick={(e) => onEdit(a, (e.currentTarget as HTMLElement).getBoundingClientRect())} className="text-left rounded px-1.5 py-1" style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderLeft: `3px solid ${a.status === "actual" ? C.green : C.brand}` }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.ink }} className="truncate">{code}</div>
                            <div style={{ fontSize: 9, color: C.meta }} className="truncate">
                              {(cls?.code ?? "")} · {a.planned_hours ?? 0}h
                            </div>
                          </button>
                        );
                      })}
                      <button onClick={() => onCell(c.id, iso)} className="rounded h-6 inline-flex items-center justify-center" style={{ border: `1px dashed ${C.rule}`, color: "#BBBBBB" }}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- modal ----------
function AllocationModal({ modal, crew, projects, classifications, plant, onClose }: {
  modal:
    | { mode: "create"; project_id?: string; person_id?: string; date: string }
    | { mode: "edit"; allocation: Allocation };
  crew: Crew[]; projects: Project[]; classifications: Classification[]; plant: PlantItem[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = modal.mode === "edit";
  const a = isEdit ? modal.allocation : null;

  const [personId, setPersonId] = useState<string>(isEdit ? a!.person_id : (modal.person_id ?? ""));
  const [projectId, setProjectId] = useState<string>(isEdit ? a!.job_id : (modal.project_id ?? ""));
  const [classificationId, setClassificationId] = useState<string>(isEdit ? (a!.classification_id ?? "") : "");
  const [plantIds, setPlantIds] = useState<string[]>(isEdit ? (a!.plant_asset_ids ?? []) : []);
  const [employmentType, setEmploymentType] = useState<string>(() => {
    if (isEdit) return normEmployment(a!.employment_type ?? crew.find((c) => c.id === a!.person_id)?.employment_type);
    const c = crew.find((x) => x.id === modal.person_id);
    return normEmployment(c?.employment_type);
  });
  const [plannedHours, setPlannedHours] = useState<string>(isEdit ? String(a!.planned_hours ?? 10) : "10");
  const [notes, setNotes] = useState<string>(isEdit ? (a!.notes ?? "") : "");
  const [err, setErr] = useState<string | null>(null);
  const date = isEdit ? a!.allocation_date : modal.date;

  useEffect(() => {
    if (isEdit) return;
    const c = crew.find((x) => x.id === personId);
    if (c?.employment_type) setEmploymentType(normEmployment(c.employment_type));
  }, [personId, crew, isEdit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error("Pick a person.");
      if (!projectId) throw new Error("Pick a project.");
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        allocation_date: date,
        person_id: personId,
        job_id: projectId,
        classification_id: classificationId || null,
        plant_asset_ids: plantIds.length ? plantIds : null,
        employment_type: employmentType,
        planned_hours: plannedHours ? Number(plannedHours) : null,
        notes: notes || null,
        source: isEdit ? a!.source : "board",
        status: isEdit ? a!.status : "planned",
      };
      if (!isEdit) payload.created_by = u.user?.id ?? null;
      if (isEdit) {
        const { error } = await supabase.from("daily_allocations").update(payload).eq("id", a!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_allocations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2-alloc"] }); qc.invalidateQueries({ queryKey: ["v2-person-grid"] }); onClose(); },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  const markAbsent = useMutation({
    mutationFn: async () => {
      if (!isEdit) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("daily_allocations").insert({
        allocation_date: a!.allocation_date, person_id: a!.person_id, job_id: a!.job_id,
        classification_id: a!.classification_id, employment_type: a!.employment_type,
        status: "actual", source: "board", actual_hours: 0, notes: "absent",
        planned_allocation_id: a!.id, created_by: u.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2-alloc"] }); onClose(); },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!isEdit) return;
      const { error } = await supabase.from("daily_allocations").delete().eq("id", a!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2-alloc"] }); qc.invalidateQueries({ queryKey: ["v2-person-grid"] }); onClose(); },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: POPPINS, colorScheme: "light" }}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div className="relative rounded-lg shadow-xl w-full max-w-md" style={{ background: C.surface, border: `0.5px solid ${C.rule}`, color: C.ink }}>
        <div className="px-5 py-4 flex items-baseline justify-between" style={{ borderBottom: `0.5px solid ${C.rule}` }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: C.brand }}>{isEdit ? "Edit allocation" : "Add allocation"}</h2>
            <p style={{ fontSize: 11, color: C.meta }}>{date}</p>
          </div>
          <button onClick={onClose} style={{ color: C.meta }}>✕</button>
        </div>
        <div className="px-5 py-4 grid gap-3">
          <Field label="Person">
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="sel">
              <option value="">— Select —</option>
              {crew.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="sel">
              <option value="">— Select —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="Classification">
            <select value={classificationId} onChange={(e) => setClassificationId(e.target.value)} className="sel">
              <option value="">— None —</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>{c.code ?? c.classification}</option>
              ))}
            </select>
          </Field>
          <Field label="Plant (Ctrl/Cmd to multi-select)">
            <select multiple value={plantIds} onChange={(e) => setPlantIds(Array.from(e.target.selectedOptions, (o) => o.value))} className="sel" style={{ height: 110 }}>
              {plant.map((p) => <option key={p.id} value={p.id}>{p.plant_id_code} — {p.name ?? p.description ?? ""}</option>)}
            </select>
          </Field>
          <Field label="Employment type">
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="sel">
              <option value="employee">Employee</option>
              <option value="casual">Casual</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </Field>
          <Field label="Planned hours">
            <input type="number" step="0.25" value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} className="sel" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="sel" />
          </Field>
          {err && <p className="text-xs inline-flex items-center gap-1" style={{ color: C.brand }}><AlertCircle className="h-3.5 w-3.5" />{err}</p>}
        </div>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: `0.5px solid ${C.rule}` }}>
          <div className="flex items-center gap-3">
            {isEdit && (
              <>
                <button onClick={() => del.mutate()} disabled={del.isPending} className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.16em] font-semibold" style={{ color: C.meta }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                <button onClick={() => markAbsent.mutate()} disabled={markAbsent.isPending} className="text-xs uppercase tracking-[0.16em] font-semibold" style={{ color: C.brand }}>
                  Mark absent
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs uppercase tracking-[0.16em] font-semibold px-3 py-2 rounded" style={{ border: `1px solid ${C.rule}`, color: C.ink, background: C.surface }}>Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="text-xs uppercase tracking-[0.16em] font-semibold px-4 py-2 rounded text-white" style={{ background: C.green }}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .sel { width:100%; border:1px solid ${C.rule}; border-radius:4px; padding:6px 10px; font-size:12px; background:${C.surface}; color:${C.ink}; font-family:${POPPINS}; }
        .sel:focus { outline:none; border-color:${C.brand}; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: 10, color: C.meta, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

// ---------- week planner (bulk) ----------
function WeekPlannerModal({ weekStart, crew, projects, classifications, onClose }: {
  weekStart: Date; crew: Crew[]; projects: Project[]; classifications: Classification[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [personId, setPersonId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [classificationId, setClassificationId] = useState("");
  const [employmentType, setEmploymentType] = useState("employee");
  const [plannedHours, setPlannedHours] = useState("10");
  const [notes, setNotes] = useState("");
  // default Mon–Fri
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    days.forEach((d, i) => { o[isoDate(d)] = i < 5; });
    return o;
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const c = crew.find((x) => x.id === personId);
    if (c?.employment_type) setEmploymentType(normEmployment(c.employment_type));
  }, [personId, crew]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedDates = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);

  const save = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error("Pick a person.");
      if (!projectId) throw new Error("Pick a project.");
      if (selectedDates.length === 0) throw new Error("Pick at least one day.");
      const { data: u } = await supabase.auth.getUser();
      const rows = selectedDates.map((d) => ({
        allocation_date: d,
        person_id: personId,
        job_id: projectId,
        classification_id: classificationId || null,
        employment_type: employmentType,
        planned_hours: plannedHours ? Number(plannedHours) : null,
        notes: notes || null,
        source: "board",
        status: "planned",
        created_by: u.user?.id ?? null,
      }));
      const { error } = await supabase.from("daily_allocations").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-alloc"] });
      qc.invalidateQueries({ queryKey: ["v2-person-grid"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: POPPINS, colorScheme: "light" }}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div className="relative rounded-lg shadow-xl w-full max-w-lg" style={{ background: C.surface, border: `0.5px solid ${C.rule}`, color: C.ink }}>
        <div className="px-5 py-4 flex items-baseline justify-between" style={{ borderBottom: `0.5px solid ${C.rule}` }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: C.brand }}>Plan week</h2>
            <p style={{ fontSize: 11, color: C.meta }}>
              Week of {weekStart.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
            </p>
          </div>
          <button onClick={onClose} style={{ color: C.meta }}>✕</button>
        </div>
        <div className="px-5 py-4 grid gap-3">
          <Field label="Person">
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="sel">
              <option value="">— Select —</option>
              {crew.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="sel">
              <option value="">— Select —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Classification">
              <select value={classificationId} onChange={(e) => setClassificationId(e.target.value)} className="sel">
                <option value="">— None —</option>
                {classifications.map((c) => (
                  <option key={c.id} value={c.id}>{c.code ?? c.classification}</option>
                ))}
              </select>
            </Field>
            <Field label="Employment">
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="sel">
                <option value="employee">Employee</option>
                <option value="casual">Casual</option>
                <option value="subcontractor">Subcontractor</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Planned hours">
              <input type="number" step="0.25" value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} className="sel" />
            </Field>
            <Field label="Notes">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="sel" />
            </Field>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.meta, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }} className="mb-2">Days</div>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => {
                const iso = isoDate(d);
                const on = !!picked[iso];
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setPicked((p) => ({ ...p, [iso]: !p[iso] }))}
                    className="px-3 h-9 rounded-md text-xs font-semibold uppercase tracking-wider"
                    style={{
                      background: on ? C.brand : C.surface,
                      color: on ? "#fff" : C.ink,
                      border: `1px solid ${on ? C.brand : C.rule}`,
                    }}
                  >
                    {d.toLocaleDateString("en-AU", { weekday: "short" })} {d.getDate()}
                  </button>
                );
              })}
            </div>
            <p className="mt-2" style={{ fontSize: 11, color: C.meta }}>
              {selectedDates.length} day{selectedDates.length === 1 ? "" : "s"} — creates one allocation per day.
            </p>
          </div>
          {err && <p className="text-xs inline-flex items-center gap-1" style={{ color: C.brand }}><AlertCircle className="h-3.5 w-3.5" />{err}</p>}
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `0.5px solid ${C.rule}` }}>
          <button onClick={onClose} className="text-xs uppercase tracking-[0.16em] font-semibold px-3 py-2 rounded" style={{ border: `1px solid ${C.rule}`, color: C.ink, background: C.surface }}>Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="text-xs uppercase tracking-[0.16em] font-semibold px-4 py-2 rounded text-white" style={{ background: C.green }}>
            {save.isPending ? "Saving…" : `Save ${selectedDates.length || ""}`}
          </button>
        </div>
      </div>
      <style>{`
        .sel { width:100%; border:1px solid ${C.rule}; border-radius:4px; padding:6px 10px; font-size:12px; background:${C.surface}; color:${C.ink}; font-family:${POPPINS}; }
        .sel:focus { outline:none; border-color:${C.brand}; }
      `}</style>
    </div>
  );
}

// ---------- quick edit popover (inline) ----------
function QuickEditPopover({ allocation, anchor, projects, classifications, onClose, onFull }: {
  allocation: Allocation; anchor: DOMRect; projects: Project[]; classifications: Classification[];
  onClose: () => void; onFull: () => void;
}) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState(allocation.job_id);
  const [classificationId, setClassificationId] = useState(allocation.classification_id ?? "");
  const [plannedHours, setPlannedHours] = useState(String(allocation.planned_hours ?? ""));
  const [notes, setNotes] = useState(allocation.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const W = 280;
  const left = Math.min(window.innerWidth - W - 12, Math.max(12, anchor.left));
  const top = Math.min(window.innerHeight - 320, anchor.bottom + 6);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("daily_allocations").update({
        job_id: projectId,
        classification_id: classificationId || null,
        planned_hours: plannedHours ? Number(plannedHours) : null,
        notes: notes || null,
      }).eq("id", allocation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-alloc"] });
      qc.invalidateQueries({ queryKey: ["v2-person-grid"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("daily_allocations").delete().eq("id", allocation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-alloc"] });
      qc.invalidateQueries({ queryKey: ["v2-person-grid"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-lg shadow-xl"
        style={{ left, top, width: W, background: C.surface, border: `0.5px solid ${C.rule}`, color: C.ink, fontFamily: POPPINS }}
      >
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${C.rule}` }}>
          <div style={{ fontSize: 11, color: C.meta }}>{allocation.allocation_date}</div>
          <button onClick={onFull} style={{ fontSize: 10, color: C.brand, fontWeight: 600 }} className="uppercase tracking-wider">More…</button>
        </div>
        <div className="px-3 py-3 grid gap-2">
          <label className="grid gap-1">
            <span style={{ fontSize: 10, color: C.meta, textTransform: "uppercase", fontWeight: 600 }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="qe">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span style={{ fontSize: 10, color: C.meta, textTransform: "uppercase", fontWeight: 600 }}>Classification</span>
            <select value={classificationId} onChange={(e) => setClassificationId(e.target.value)} className="qe">
              <option value="">— None —</option>
              {classifications.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.classification}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span style={{ fontSize: 10, color: C.meta, textTransform: "uppercase", fontWeight: 600 }}>Hours</span>
            <input type="number" step="0.25" value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} className="qe" />
          </label>
          <label className="grid gap-1">
            <span style={{ fontSize: 10, color: C.meta, textTransform: "uppercase", fontWeight: 600 }}>Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="qe" />
          </label>
          {err && <p style={{ fontSize: 11, color: C.brand }}>{err}</p>}
        </div>
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: `0.5px solid ${C.rule}` }}>
          <button onClick={() => del.mutate()} disabled={del.isPending} className="inline-flex items-center gap-1" style={{ fontSize: 11, color: C.meta }}>
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-2 py-1 rounded" style={{ fontSize: 11, border: `1px solid ${C.rule}`, color: C.ink }}>Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="px-3 py-1 rounded text-white" style={{ fontSize: 11, background: C.green }}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <style>{`
          .qe { width:100%; border:1px solid ${C.rule}; border-radius:4px; padding:4px 8px; font-size:12px; background:${C.surface}; color:${C.ink}; font-family:${POPPINS}; }
          .qe:focus { outline:none; border-color:${C.brand}; }
        `}</style>
      </div>
    </>
  );
}
