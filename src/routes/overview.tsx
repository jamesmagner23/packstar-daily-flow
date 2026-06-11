import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { TrendingUp, TrendingDown, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — PACC HQ" },
      { name: "description", content: "Whole-of-business productivity and utilisation across all PACC projects." },
    ],
  }),
  component: OverviewPage,
});

// ---------------- Design tokens (Prompt 4) ----------------
const C = {
  brand: "#DC3D3F",
  ink: "#1A1A1A",
  meta: "#4A4A4A",
  rule: "#E5E5E5",
  surface: "#FFFFFF",
  page: "#F1EFE8",
  green: "#3B6D11",
  amber: "#BA7517",
  blue: "#185FA5",
  teal: "#0F6E56",
  link: "#22c55e",
};
const POPPINS = "Poppins, ui-sans-serif, system-ui";

// ---------------- Date helpers ----------------
type RangeKey = "7d" | "30d" | "90d" | "ytd";
type Range = { from: string; to: string; days: number };

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtRange(from: string, to: string, includeYear: boolean) {
  const f = new Date(from); const t = new Date(to);
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return `${fmt(f, !sameYear)} - ${fmt(t, includeYear || sameYear)}`;
}
function workingDays(from: string, to: string) {
  let n = 0;
  for (let d = new Date(from); d <= new Date(to); d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}
function rangesFor(kind: RangeKey): { current: Range; previous: Range } {
  const today = new Date(iso(new Date()));
  if (kind === "ytd") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const days = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    const prevStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
    const prevEnd = addDays(prevStart, days - 1);
    return {
      current: { from: iso(start), to: iso(today), days },
      previous: { from: iso(prevStart), to: iso(prevEnd), days },
    };
  }
  const span = kind === "7d" ? 7 : kind === "30d" ? 30 : 90;
  const start = addDays(today, -(span - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(span - 1));
  return {
    current: { from: iso(start), to: iso(today), days: span },
    previous: { from: iso(prevStart), to: iso(prevEnd), days: span },
  };
}

// ---------------- Types ----------------
type Alloc = {
  allocation_date: string;
  person_id: string | null;
  job_id: string;
  status: string;
  planned_hours: number | null;
  actual_hours: number | null;
  plant_asset_ids: string[] | null;
};
type Crew = { id: string; name: string; employment_type: string | null; active: boolean | null };
type Plant = { id: string; plant_id_code: string; name: string | null; tonnage_class: string | null; active: boolean | null };
type Proj = { id: string; code: string; name: string; active: boolean | null };

// ---------------- Page ----------------
function OverviewPage() {
  const [kind, setKind] = useState<RangeKey>("30d");
  const { current, previous } = useMemo(() => rangesFor(kind), [kind]);

  const allocsCur = useQuery({
    queryKey: ["ov-alloc", current.from, current.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("allocation_date, person_id, job_id, status, planned_hours, actual_hours, plant_asset_ids")
        .gte("allocation_date", current.from).lte("allocation_date", current.to);
      if (error) throw error;
      return (data ?? []) as Alloc[];
    },
  });
  const allocsPrev = useQuery({
    queryKey: ["ov-alloc", previous.from, previous.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("allocation_date, person_id, job_id, status, planned_hours, actual_hours, plant_asset_ids")
        .gte("allocation_date", previous.from).lte("allocation_date", previous.to);
      if (error) throw error;
      return (data ?? []) as Alloc[];
    },
  });
  const crewQ = useQuery({
    queryKey: ["ov-crew"],
    queryFn: async () => {
      const { data } = await supabase.from("crew_members")
        .select("id, name, employment_type, active").eq("active", true).order("name");
      return (data ?? []) as Crew[];
    },
  });
  const plantQ = useQuery({
    queryKey: ["ov-plant"],
    queryFn: async () => {
      const { data } = await supabase.from("plant_items")
        .select("id, plant_id_code, name, tonnage_class, active").eq("active", true).order("plant_id_code");
      return (data ?? []) as Plant[];
    },
  });
  const projQ = useQuery({
    queryKey: ["ov-proj"],
    queryFn: async () => {
      const { data } = await supabase.from("projects")
        .select("id, code, name, active").eq("active", true).order("code");
      return (data ?? []) as Proj[];
    },
  });

  const allocs = allocsCur.data ?? [];
  const prevAllocs = allocsPrev.data ?? [];
  const crew = crewQ.data ?? [];
  const plant = plantQ.data ?? [];
  const projects = projQ.data ?? [];

  // ---------- Hero stats ----------
  const stats = useMemo(() => computeStats(allocs), [allocs]);
  const statsPrev = useMemo(() => computeStats(prevAllocs), [prevAllocs]);

  const hasActuals = stats.worked > 0;
  const hasPrevActuals = statsPrev.worked > 0;

  const pctChange = (cur: number, prev: number) => {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
  };

  // ---------- Labour utilisation ----------
  const workingDayCount = workingDays(current.from, current.to);
  const labourRows = useMemo(() => {
    const byPerson = new Map<string, { days: Set<string>; hours: number }>();
    for (const a of allocs) {
      if (!a.person_id) continue;
      if (a.status !== "planned" && a.status !== "actual") continue;
      const row = byPerson.get(a.person_id) ?? { days: new Set(), hours: 0 };
      row.days.add(a.allocation_date);
      row.hours += Number(a.actual_hours ?? a.planned_hours ?? 0);
      byPerson.set(a.person_id, row);
    }
    return crew.map((c) => {
      const r = byPerson.get(c.id) ?? { days: new Set<string>(), hours: 0 };
      const utl = workingDayCount > 0 ? (r.days.size / workingDayCount) * 100 : 0;
      return { id: c.id, name: c.name, hours: r.hours, util: utl };
    }).sort((a, b) => b.util - a.util);
  }, [allocs, crew, workingDayCount]);

  // ---------- OT per person ----------
  const otRows = useMemo(() => {
    const byKey = new Map<string, number>(); // person|date → sum actual
    for (const a of allocs) {
      if (!a.person_id || a.actual_hours == null) continue;
      const k = `${a.person_id}|${a.allocation_date}`;
      byKey.set(k, (byKey.get(k) ?? 0) + Number(a.actual_hours));
    }
    const otByPerson = new Map<string, { ot: number; worked: number }>();
    for (const [k, sum] of byKey) {
      const [pid] = k.split("|");
      const ot = Math.max(0, sum - 10);
      const cur = otByPerson.get(pid) ?? { ot: 0, worked: 0 };
      cur.ot += ot;
      cur.worked += sum;
      otByPerson.set(pid, cur);
    }
    const named = crew.map((c) => {
      const r = otByPerson.get(c.id) ?? { ot: 0, worked: 0 };
      const otPct = r.worked > 0 ? (r.ot / r.worked) * 100 : 0;
      return { id: c.id, name: c.name, ot: r.ot, otPct };
    }).filter((r) => r.ot > 0).sort((a, b) => b.ot - a.ot);
    return named;
  }, [allocs, crew]);
  const maxOt = otRows[0]?.ot ?? 0;

  // ---------- Plant utilisation ----------
  const plantRows = useMemo(() => {
    const byPlant = new Map<string, { days: Set<string>; hours: number }>();
    for (const a of allocs) {
      const ids = a.plant_asset_ids ?? [];
      if (!ids.length) continue;
      const hrs = Number(a.actual_hours ?? a.planned_hours ?? 0);
      for (const pid of ids) {
        const row = byPlant.get(pid) ?? { days: new Set<string>(), hours: 0 };
        row.days.add(a.allocation_date);
        row.hours += hrs;
        byPlant.set(pid, row);
      }
    }
    return plant.map((p) => {
      const r = byPlant.get(p.id) ?? { days: new Set<string>(), hours: 0 };
      const utl = workingDayCount > 0 ? (r.days.size / workingDayCount) * 100 : 0;
      return {
        id: p.id,
        label: `${p.plant_id_code}${p.tonnage_class ? ` · ${p.tonnage_class}` : p.name ? ` · ${p.name}` : ""}`,
        hours: r.hours,
        util: utl,
        inUse: r.days.size > 0,
      };
    }).sort((a, b) => b.util - a.util);
  }, [allocs, plant, workingDayCount]);

  const plantInUse = plantRows.filter((r) => r.inUse).length;

  // ---------- Project hours ----------
  const projectRows = useMemo(() => {
    const byProj = new Map<string, { planned: number; actual: number }>();
    for (const a of allocs) {
      const r = byProj.get(a.job_id) ?? { planned: 0, actual: 0 };
      r.planned += Number(a.planned_hours ?? 0);
      if (a.actual_hours != null) r.actual += Number(a.actual_hours);
      byProj.set(a.job_id, r);
    }
    const rows = projects.map((p) => {
      const r = byProj.get(p.id) ?? { planned: 0, actual: 0 };
      const variancePct = r.planned > 0 ? ((r.actual - r.planned) / r.planned) * 100 : null;
      return { id: p.id, name: `${p.code} — ${p.name}`, planned: r.planned, actual: r.actual, variancePct };
    }).filter((r) => r.planned > 0 || r.actual > 0)
      .sort((a, b) => b.actual - a.actual);
    return rows;
  }, [allocs, projects]);
  const maxProjActual = projectRows[0]?.actual ?? 0;

  // ---------- Employment mix ----------
  const empMix = useMemo(() => {
    const m = { employee: 0, casual: 0, subcontractor: 0 };
    for (const c of crew) {
      const t = (c.employment_type ?? "employee").toLowerCase();
      if (t === "casual") m.casual++;
      else if (t === "subcontractor" || t === "subbie" || t === "sub") m.subcontractor++;
      else m.employee++;
    }
    return m;
  }, [crew]);

  const subhead = `${fmtRange(current.from, current.to, true)} · vs ${fmtRange(previous.from, previous.to, false)}`;

  return (
    <SiteShell section="Overview">
      <div style={{ background: C.page, colorScheme: "light", color: C.ink, fontFamily: POPPINS }} className="-mx-4 -my-6 p-[14px] md:-mx-8 min-h-screen">
        {/* Header */}
        <header className="mb-4">
          <h1 style={{ fontFamily: POPPINS, color: C.brand, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Overview</h1>
          <p style={{ fontSize: 11, color: C.meta, marginTop: 4 }}>{subhead}</p>
          <div className="mt-3">
            <RangePill kind={kind} onChange={setKind} />
          </div>
        </header>

        {/* Hero stats 2x2 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Tile
            eyebrow="Allocated"
            primary={`${fmtH(stats.allocated)}h`}
            comparison={comparisonLabel(pctChange(stats.allocated, statsPrev.allocated))}
          />
          <Tile
            eyebrow="Worked"
            primary={hasActuals ? `${fmtH(stats.worked)}h` : "—"}
            comparison={hasActuals && hasPrevActuals ? comparisonLabel(pctChange(stats.worked, statsPrev.worked)) : null}
          />
          <Tile
            eyebrow="Overtime"
            primary={hasActuals ? `${fmtH(stats.ot)}h` : "—"}
            inlineSecondary={hasActuals ? `· ${stats.otPct.toFixed(1)}%` : undefined}
            inlineColor={C.amber}
            comparison={hasActuals && hasPrevActuals ? comparisonLabel(pctChange(stats.ot, statsPrev.ot)) : null}
          />
          <Tile
            eyebrow="Variance"
            primary={hasActuals ? `${signed(stats.variance)}h` : "—"}
            inlineSecondary={hasActuals ? `· ${signedPct(stats.variancePct)}` : undefined}
            inlineColor={C.amber}
            comparison={hasPrevActuals ? `from ${signedPct(statsPrev.variancePct)}` : null}
          />
        </div>

        {/* Counts strip */}
        <p className="text-center mb-5" style={{ fontSize: 11, color: C.meta }}>
          {crew.length} active crew · {plantInUse}/{plant.length} plant in use · {projects.length} active projects
        </p>

        {/* Cards */}
        <div className="grid gap-3">
          <Card title="Labour utilisation" subhead="% of working days allocated, sorted high to low">
            <UtilList rows={labourRows.map((r) => ({ id: r.id, label: r.name, hours: r.hours, pct: r.util, dot: utilDot(r.util) }))} variant="labour" />
          </Card>

          <Card title="Overtime" subhead="OT hours by person, % of their total worked">
            {otRows.length === 0 ? (
              <p style={{ fontSize: 13, color: C.meta, fontStyle: "italic" }}>No overtime recorded in this period.</p>
            ) : (
              <div className="grid gap-1.5">
                {otRows.map((r) => {
                  const dot = otDot(r.otPct);
                  const barPct = maxOt > 0 ? (r.ot / maxOt) * 100 : 0;
                  return (
                    <div key={r.id} className="flex items-center gap-2">
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                      <span style={{ flexBasis: 60, fontSize: 13, fontWeight: 500, color: C.ink }}>{r.name}</span>
                      <span style={{ flexBasis: 42, fontSize: 12, color: C.meta }}>{fmtH(r.ot)}h ot</span>
                      <div style={{ flex: 1, height: 6, background: C.page, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${barPct}%`, height: "100%", background: dot, borderRadius: 999 }} />
                      </div>
                      <span style={{ flexBasis: 30, textAlign: "right", fontSize: 12, color: C.ink }}>{r.otPct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Plant utilisation" subhead="% of days allocated, sorted high to low">
            <UtilList rows={plantRows.map((r) => ({ id: r.id, label: r.label, hours: r.hours, pct: r.util, dot: utilDot(r.util) }))} variant="plant" />
          </Card>

          <Card title="Project hours" subhead="Worked vs allocated · variance">
            {!hasActuals || projectRows.every((r) => r.actual === 0) ? (
              <p style={{ fontSize: 13, color: C.meta, fontStyle: "italic" }}>Insufficient wrap data — submit some daily wraps to see variance</p>
            ) : (
              <div className="grid gap-3">
                {projectRows.map((r) => {
                  const status = projectVarianceColor(r.variancePct);
                  const barW = maxProjActual > 0 ? (r.actual / maxProjActual) * 100 : 0;
                  return (
                    <div key={r.id}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: status, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: status }}>
                          {r.variancePct == null ? "—" : signedPct(r.variancePct)}
                        </span>
                      </div>
                      <div style={{ marginLeft: 16, fontSize: 11, color: C.meta, marginTop: 2 }}>
                        {fmtH(r.actual)}h worked · {fmtH(r.planned)}h allocated
                      </div>
                      <div style={{ marginLeft: 16, marginTop: 4, height: 6, background: C.page, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${barW}%`, height: "100%", background: status, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Employment mix" subhead="Current active crew">
            <EmpMix mix={empMix} />
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}

// ---------------- Sub-components ----------------

function RangePill({ kind, onChange }: { kind: RangeKey; onChange: (k: RangeKey) => void }) {
  const opts: { key: RangeKey; label: string }[] = [
    { key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "90d", label: "90d" }, { key: "ytd", label: "YTD" },
  ];
  return (
    <div className="inline-flex items-center rounded-full p-0.5" style={{ background: C.page, border: `0.5px solid ${C.rule}` }}>
      {opts.map((o) => {
        const active = kind === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="px-3 py-1 rounded-full"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              background: active ? C.brand : "transparent",
              color: active ? "#FFFFFF" : C.meta,
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function Tile({ eyebrow, primary, inlineSecondary, inlineColor, comparison }: {
  eyebrow: string; primary: string; inlineSecondary?: string; inlineColor?: string; comparison: string | null;
}) {
  const trendDown = comparison?.trim().startsWith("-") || comparison?.trim().startsWith("from -");
  const TrendIcon = trendDown ? TrendingDown : TrendingUp;
  return (
    <div style={{ background: C.page, padding: 12, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: C.meta, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>{eyebrow}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span style={{ fontSize: 22, fontWeight: 500, color: C.ink, lineHeight: 1.1 }}>{primary}</span>
        {inlineSecondary && (
          <span style={{ fontSize: 13, fontWeight: 500, color: inlineColor ?? C.meta }}>{inlineSecondary}</span>
        )}
      </div>
      {comparison && (
        <div className="mt-1 flex items-center gap-1" style={{ fontSize: 13, color: C.meta }}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{comparison}</span>
        </div>
      )}
    </div>
  );
}

function Card({ title, subhead, children }: { title: string; subhead: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.surface, border: `0.5px solid ${C.rule}`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 11, color: C.meta, marginBottom: 10 }}>{subhead}</div>
      {children}
    </section>
  );
}

function UtilList({ rows, variant }: {
  rows: { id: string; label: string; hours: number; pct: number; dot: string }[];
  variant: "labour" | "plant";
}) {
  const [expanded, setExpanded] = useState(false);
  const TOP = 7;
  const show = expanded ? rows : rows.slice(0, TOP);
  const labelBasis = variant === "plant" ? 72 : 60;
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: C.meta, fontStyle: "italic" }}>Nothing to show yet.</p>;
  }
  return (
    <>
      <div className="grid gap-1.5">
        {show.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: r.dot, flexShrink: 0 }} />
            <span style={{ flexBasis: labelBasis, fontSize: 13, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ flexBasis: 38, fontSize: 12, color: C.meta }}>{fmtH(r.hours)}h</span>
            <div style={{ flex: 1, height: 6, background: C.page, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, r.pct)}%`, height: "100%", background: r.dot, borderRadius: 999 }} />
            </div>
            <span style={{ flexBasis: 30, textAlign: "right", fontSize: 12, color: C.ink }}>{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {rows.length > TOP && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 mt-3"
          style={{ fontSize: 11, color: C.link, fontWeight: 600 }}
        >
          {expanded ? "Collapse" : `View all ${rows.length} ${variant === "plant" ? "items" : "crew"}`}
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}

function EmpMix({ mix }: { mix: { employee: number; casual: number; subcontractor: number } }) {
  const total = mix.employee + mix.casual + mix.subcontractor;
  if (total === 0) {
    return <p style={{ fontSize: 13, color: C.meta, fontStyle: "italic" }}>No active crew.</p>;
  }
  const segs = [
    { key: "employee", label: "Employee", count: mix.employee, color: C.blue },
    { key: "casual", label: "Casual", count: mix.casual, color: C.amber },
    { key: "subcontractor", label: "Subcontractor", count: mix.subcontractor, color: C.teal },
  ];
  return (
    <>
      <div className="flex" style={{ height: 22, borderRadius: 6, overflow: "hidden" }}>
        {segs.filter((s) => s.count > 0).map((s) => (
          <div key={s.key} style={{ flex: s.count, background: s.color }} />
        ))}
      </div>
      <div className="grid gap-1.5 mt-3">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: C.ink }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{s.count}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- Calcs & formatting ----------------

function computeStats(allocs: Alloc[]) {
  let allocated = 0;
  let worked = 0;
  const byPersonDate = new Map<string, number>();
  for (const a of allocs) {
    allocated += Number(a.planned_hours ?? 0);
    if (a.actual_hours != null && a.status === "actual") {
      const h = Number(a.actual_hours);
      worked += h;
      if (a.person_id) {
        const k = `${a.person_id}|${a.allocation_date}`;
        byPersonDate.set(k, (byPersonDate.get(k) ?? 0) + h);
      }
    }
  }
  let ot = 0;
  for (const h of byPersonDate.values()) ot += Math.max(0, h - 10);
  const variance = worked - allocated;
  const variancePct = allocated > 0 ? (variance / allocated) * 100 : 0;
  const otPct = worked > 0 ? (ot / worked) * 100 : 0;
  return { allocated, worked, ot, otPct, variance, variancePct };
}

function utilDot(p: number) {
  if (p >= 80) return C.green;
  if (p >= 50) return C.amber;
  return C.brand;
}
function otDot(p: number) {
  if (p < 10) return C.green;
  if (p < 15) return C.amber;
  return C.brand;
}
function projectVarianceColor(p: number | null) {
  if (p == null) return C.meta;
  if (p >= -5 && p <= 5) return C.green;
  if (p > 5 && p <= 10) return C.amber;
  return C.brand;
}
function fmtH(n: number) {
  return Math.round(n).toLocaleString("en-AU");
}
function signed(n: number) {
  const r = Math.round(n);
  return r >= 0 ? `+${r.toLocaleString("en-AU")}` : `${r.toLocaleString("en-AU")}`;
}
function signedPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function comparisonLabel(p: number | null) {
  if (p == null || !isFinite(p)) return "—";
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}% vs prev`;
}
