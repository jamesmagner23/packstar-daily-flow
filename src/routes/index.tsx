import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { RangeToggle } from "@/components/RangeToggle";
import { aud, audAcct, pct, shortDate } from "@/lib/format";
import {
  type DateRange,
  type RangeKind,
  getWeekRange,
} from "@/lib/date-range";
import {
  normalizeProjectType,
  projectTypeLabel,
  type ProjectType,
} from "@/lib/project-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PACC HQ — business overview" },
      { name: "description", content: "Business-wide daily P&L across lump sum, labour hire, plant hire and dry hire." },
    ],
  }),
  component: Dashboard,
});

const TYPE_ORDER: ProjectType[] = ["lump_sum", "labour_hire", "plant_hire", "dry_hire"];
const HIRE_TYPES: ProjectType[] = ["labour_hire", "plant_hire", "dry_hire"];

type ProjectRow = { id: string; code: string; name: string; project_type: string | null; active: boolean | null };
type ReportRow = {
  id: string;
  project_id: string | null;
  report_date: string;
  revenue_aud: number | null;
  cost_aud: number | null;
  margin_aud: number | null;
};

function sum(rows: ReportRow[], key: "revenue_aud" | "cost_aud" | "margin_aud") {
  return rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
}

function gpPct(rev: number, margin: number): number | null {
  if (rev <= 0) return null;
  return (margin / rev) * 100;
}

function Dashboard() {
  const [kind, setKind] = useState<RangeKind>("week");
  const [range, setRange] = useState<DateRange>(() => getWeekRange());
  const today = new Date().toISOString().slice(0, 10);

  const { data: projects = [] } = useQuery({
    queryKey: ["all-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, code, name, project_type, active")
        .order("code");
      return (data ?? []) as ProjectRow[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["all-reports", range.from, range.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, project_id, report_date, revenue_aud, cost_aud, margin_aud")
        .gte("report_date", range.from)
        .lte("report_date", range.to);
      return (data ?? []) as ReportRow[];
    },
  });

  const { data: todayReports = [] } = useQuery({
    queryKey: ["reports-today", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("project_id")
        .eq("report_date", today);
      return (data ?? []) as { project_id: string | null }[];
    },
  });

  const projectIndex = useMemo(() => {
    const m = new Map<string, ProjectRow & { type: ProjectType }>();
    for (const p of projects) {
      m.set(p.id, { ...p, type: normalizeProjectType(p.project_type) });
    }
    return m;
  }, [projects]);

  // Totals overall
  const totals = useMemo(() => {
    const rev = sum(reports, "revenue_aud");
    const cost = sum(reports, "cost_aud");
    const margin = sum(reports, "margin_aud");
    return { rev, cost, margin, gp: gpPct(rev, margin), count: reports.length };
  }, [reports]);

  // Breakdown by project type
  const byType = useMemo(() => {
    const out: Record<ProjectType, { rev: number; cost: number; margin: number; gp: number | null; reportCount: number; projectIds: Set<string> }> = {
      lump_sum: { rev: 0, cost: 0, margin: 0, gp: null, reportCount: 0, projectIds: new Set() },
      labour_hire: { rev: 0, cost: 0, margin: 0, gp: null, reportCount: 0, projectIds: new Set() },
      plant_hire: { rev: 0, cost: 0, margin: 0, gp: null, reportCount: 0, projectIds: new Set() },
      dry_hire: { rev: 0, cost: 0, margin: 0, gp: null, reportCount: 0, projectIds: new Set() },
    };
    for (const r of reports) {
      const p = r.project_id ? projectIndex.get(r.project_id) : null;
      const t: ProjectType = p?.type ?? "lump_sum";
      out[t].rev += Number(r.revenue_aud ?? 0);
      out[t].cost += Number(r.cost_aud ?? 0);
      out[t].margin += Number(r.margin_aud ?? 0);
      out[t].reportCount += 1;
      if (r.project_id) out[t].projectIds.add(r.project_id);
    }
    for (const t of TYPE_ORDER) out[t].gp = gpPct(out[t].rev, out[t].margin);
    return out;
  }, [reports, projectIndex]);

  // Per-project rollups
  const perProject = useMemo(() => {
    const m = new Map<string, { rev: number; cost: number; margin: number; reportCount: number; lastDate: string | null }>();
    for (const r of reports) {
      if (!r.project_id) continue;
      const cur = m.get(r.project_id) ?? { rev: 0, cost: 0, margin: 0, reportCount: 0, lastDate: null };
      cur.rev += Number(r.revenue_aud ?? 0);
      cur.cost += Number(r.cost_aud ?? 0);
      cur.margin += Number(r.margin_aud ?? 0);
      cur.reportCount += 1;
      if (!cur.lastDate || r.report_date > cur.lastDate) cur.lastDate = r.report_date;
      m.set(r.project_id, cur);
    }
    return m;
  }, [reports]);

  const lumpSumProjects = projects.filter((p) => normalizeProjectType(p.project_type) === "lump_sum" && p.active);
  const hireProjects = projects.filter((p) => HIRE_TYPES.includes(normalizeProjectType(p.project_type)) && p.active);

  // Alerts
  const projectsReportedToday = new Set(todayReports.map((r) => r.project_id).filter(Boolean) as string[]);
  const missingToday = projects.filter((p) => p.active && !projectsReportedToday.has(p.id));
  const negativeMarginProjects = Array.from(perProject.entries())
    .filter(([, v]) => v.margin < 0)
    .map(([id, v]) => ({ project: projectIndex.get(id), ...v }))
    .filter((x) => x.project);

  return (
    <SiteShell section="Dashboard">
      <div className="space-y-8">
        <header className="flex items-center justify-between gap-4">
          <p className="text-sm text-meta">All active projects · {shortDate(new Date())}</p>
          <div className="flex gap-2 shrink-0">
            <Link
              to="/reports"
              className="inline-flex items-center px-3 py-1.5 border border-[color:var(--brand)] text-[color:var(--brand)] text-xs hover:bg-[color:var(--brand)] hover:text-white transition-colors whitespace-nowrap"
            >
              Reports →
            </Link>
            <Link
              to="/setup"
              className="inline-flex items-center px-3 py-1.5 border border-rule text-meta text-xs hover:text-ink whitespace-nowrap"
            >
              Setup
            </Link>
          </div>
        </header>

        {/* Range + totals */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <RangeToggle
              kind={kind}
              range={range}
              onChange={(k, r) => { setKind(k); setRange(r); }}
            />
          </div>
          <div className="hairline pt-6 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8 md:gap-8">
            <Big label="Revenue" value={totals.count ? aud(totals.rev) : "—"} tone="var(--ink)" />
            <Big label="Cost" value={totals.count ? aud(totals.cost) : "—"} tone="oklch(0.65 0.18 50)" />
            <Big
              label="Profit"
              value={totals.count ? audAcct(totals.margin) : "—"}
              tone={totals.count === 0 ? "var(--ink)" : totals.margin >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)"}
            />
          </div>
          {totals.count === 0 && (
            <p className="text-xs text-meta mt-6">No daily wraps captured in this range across any project.</p>
          )}
        </section>

        {/* By project type */}
        <section>
          <div className="t-eyebrow mb-4">By project type</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TYPE_ORDER.map((t) => {
              const b = byType[t];
              return (
                <div key={t} className="hairline pt-4 px-4 pb-5 border border-rule">
                  <div className="t-eyebrow text-meta">{projectTypeLabel(t)}</div>
                  <div className="mt-3 text-2xl font-semibold" style={{ color: b.reportCount === 0 ? "var(--ink)" : b.margin >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)" }}>
                    {b.reportCount ? audAcct(b.margin) : "—"}
                  </div>
                  <div className="t-stat-label mt-1">{b.reportCount} {b.reportCount === 1 ? "wrap" : "wraps"}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-meta">
                    <div>Rev <span className="text-ink font-semibold">{b.reportCount ? aud(b.rev) : "—"}</span></div>
                    <div>Cost <span className="text-ink font-semibold">{b.reportCount ? aud(b.cost) : "—"}</span></div>
                    <div>Wraps <span className="text-ink font-semibold">{b.reportCount}</span></div>
                    <div>Projects <span className="text-ink font-semibold">{b.projectIds.size}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Lump sum */}
        <ProjectSection
          title="Lump sum"
          eyebrow="Fixed-price contracts"
          projects={lumpSumProjects}
          perProject={perProject}
          projectIndex={projectIndex}
          showTypeColumn={false}
        />

        {/* Hire */}
        <ProjectSection
          title="Hire — labour, plant & dry"
          eyebrow="Schedule-rate work"
          projects={hireProjects}
          perProject={perProject}
          projectIndex={projectIndex}
          showTypeColumn
        />

        {/* Alerts */}
        <section>
          <div className="t-eyebrow mb-1">Today</div>
          <h2 className="t-headline mb-4">Operational alerts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AlertCard
              title="Missing daily wrap"
              subtitle={`${missingToday.length} of ${projects.filter(p => p.active).length} active projects`}
              empty="All active projects have wrapped today."
              items={missingToday.slice(0, 6).map((p) => ({
                key: p.id,
                primary: p.code,
                secondary: `${p.name} · ${projectTypeLabel(p.project_type)}`,
              }))}
            />
            <AlertCard
              title="Projects in the red"
              subtitle="Negative profit in selected range"
              empty="No projects running at a loss in this range."
              items={negativeMarginProjects.slice(0, 6).map((x) => ({
                key: x.project!.id,
                primary: x.project!.code,
                secondary: `${aud(x.margin)} · ${projectTypeLabel(x.project!.project_type)}`,
              }))}
            />
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="t-stat whitespace-nowrap overflow-hidden text-ellipsis tabular-nums"
        style={{ color: tone, fontSize: "clamp(1.1rem, 2.2vw, 2rem)" }}
        title={value}
      >
        {value}
      </div>
      <div className="t-stat-label">{label}</div>
    </div>
  );
}

type ProjectRollup = Map<string, { rev: number; cost: number; margin: number; reportCount: number; lastDate: string | null }>;

function ProjectSection({
  title,
  eyebrow,
  projects,
  perProject,
  projectIndex,
  showTypeColumn,
}: {
  title: string;
  eyebrow: string;
  projects: ProjectRow[];
  perProject: ProjectRollup;
  projectIndex: Map<string, ProjectRow & { type: ProjectType }>;
  showTypeColumn: boolean;
}) {
  const rows = projects.map((p) => {
    const r = perProject.get(p.id) ?? { rev: 0, cost: 0, margin: 0, reportCount: 0, lastDate: null };
    return { p, ...r };
  }).sort((a, b) => b.margin - a.margin);

  const t = title;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="t-eyebrow">{eyebrow}</div>
          <h2 className="t-headline mt-1">{t}</h2>
        </div>
        <span className="t-eyebrow text-meta">{projects.length} active</span>
      </div>
      <div className="hairline pt-4">
        {projects.length === 0 ? (
          <p className="text-xs text-meta py-6">No active projects of this type. Add one from Setup.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="t-stat-label">
                  <th className="py-2 font-semibold">Project</th>
                  {showTypeColumn && <th className="py-2 font-semibold">Type</th>}
                  <th className="py-2 font-semibold text-right">Revenue</th>
                  <th className="py-2 font-semibold text-right">Cost</th>
                  <th className="py-2 font-semibold text-right">Profit</th>
                  <th className="py-2 font-semibold text-right">Wraps</th>
                  <th className="py-2 font-semibold">Last wrap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, rev, cost, margin, reportCount, lastDate }) => {
                  const idx = projectIndex.get(p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        try { localStorage.setItem("pacchq.project.id", p.id); } catch {}
                        window.location.href = "/reports";
                      }}
                      className="border-t border-rule cursor-pointer hover:bg-[color:var(--accent)] transition-colors"
                    >
                      <td className="py-3 text-xs">
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-meta">{p.name}</div>
                      </td>
                      {showTypeColumn && (
                        <td className="py-3 text-[11px] uppercase tracking-wider text-meta">
                          {projectTypeLabel(idx?.type ?? p.project_type)}
                        </td>
                      )}
                      <td className="py-3 text-xs text-right tabular-nums">{reportCount ? aud(rev) : "—"}</td>
                      <td className="py-3 text-xs text-right tabular-nums" style={{ color: reportCount === 0 ? undefined : "oklch(0.65 0.18 50)" }}>{reportCount ? aud(cost) : "—"}</td>
                      <td
                        className="py-3 text-xs text-right font-semibold tabular-nums"
                        style={{ color: reportCount === 0 ? undefined : margin >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)" }}
                      >
                        {reportCount ? audAcct(margin) : "—"}
                      </td>
                      <td className="py-3 text-xs text-right">{reportCount}</td>
                      <td className="py-3 text-xs">{lastDate ? shortDate(lastDate) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function AlertCard({
  title,
  subtitle,
  empty,
  items,
}: {
  title: string;
  subtitle: string;
  empty: string;
  items: { key: string; primary: string; secondary: string }[];
}) {
  return (
    <div className="hairline pt-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold">{title}</div>
        <div className="t-stat-label">{subtitle}</div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-meta py-4">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {items.map((it) => (
            <li key={it.key} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-xs font-mono font-semibold">{it.primary}</span>
              <span className="text-[11px] text-meta truncate">{it.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
