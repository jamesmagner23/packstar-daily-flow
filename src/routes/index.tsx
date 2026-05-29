import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { RangeToggle } from "@/components/RangeToggle";
import { CrewFilter } from "@/components/CrewFilter";
import { KpiBand } from "@/components/KpiBand";
import { useActiveProjectId } from "@/hooks/use-active-project";
import { aud, pct, shortDate, businessDaysRemaining } from "@/lib/format";
import {
  type DateRange,
  type RangeKind,
  getWeekRange,
  workingDaysInRange,
} from "@/lib/date-range";
import { aggregateKpis, detectLongHire } from "@/lib/reports-aggregate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PACC HQ — PACC operational dashboard" },
      { name: "description", content: "Daily P&L, productivity, and variations register for PACC project sites." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [kind, setKind] = useState<RangeKind>("week");
  const [range, setRange] = useState<DateRange>(() => getWeekRange());
  const [crewId, setCrewId] = useState<string>("all");

  const activeProjectId = useActiveProjectId();

  const { data: project } = useQuery({
    queryKey: ["project-active", activeProjectId],
    queryFn: async () => {
      if (activeProjectId) {
        const { data } = await supabase.from("projects").select("*").eq("id", activeProjectId).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.from("projects").select("*").eq("active", true).order("code").limit(1).maybeSingle();
      return data;
    },
  });

  const projectId = project?.id as string | undefined;

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisors", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("supervisors")
        .select("id, name")
        .eq("project_id", projectId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["reports-in-range", projectId, range.from, range.to, crewId],
    enabled: !!projectId,
    queryFn: async () => {
      let q = supabase
        .from("daily_reports")
        .select("id, report_date, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, plant_hours, supervisors(name)")
        .eq("project_id", projectId!)
        .gte("report_date", range.from)
        .lte("report_date", range.to)
        .order("report_date", { ascending: false });
      if (crewId !== "all") q = q.eq("supervisor_id", crewId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: variations = [] } = useQuery({
    queryKey: ["variations-open", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("*")
        .eq("project_id", projectId!)
        .neq("status", "closed")
        .order("deadline_at", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  // Long-hire scan: pull last ~60 days, regardless of selected range.
  const { data: hireWindow = [] } = useQuery({
    queryKey: ["plant-hire-window", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const sinceIso = since.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, plant_hours")
        .eq("project_id", projectId!)
        .gte("report_date", sinceIso);
      return data ?? [];
    },
  });

  const { data: plantReg = [] } = useQuery({
    queryKey: ["plant-items", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_items")
        .select("plant_id_code, description")
        .eq("project_id", projectId!);
      return data ?? [];
    },
  });

  const kpis = useMemo(
    () =>
      aggregateKpis(
        reports as any,
        Number(project?.expected_daily_revenue_aud ?? 5000),
        workingDaysInRange(range),
      ),
    [reports, project, range],
  );

  const longHire = useMemo(
    () => detectLongHire(hireWindow as any, plantReg as any, 28, 3).slice(0, 5),
    [hireWindow, plantReg],
  );

  const crews = supervisors.map((s: any) => ({ id: s.id, name: s.name }));

  return (
    <SiteShell section="Dashboard">
      <div className="space-y-12">
        <header className="space-y-3 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-3">
            <div className="t-eyebrow">{project?.code ?? "No project loaded"}</div>
            <h1 className="t-display">{project?.name ?? "Connect a project to begin"}</h1>
            {project?.head_contractor && (
              <p className="t-lead">Head contractor {project.head_contractor}. {shortDate(new Date())}.</p>
            )}
          </div>
          <Link
            to="/reports"
            className="inline-flex items-center px-4 py-2 border border-[color:var(--brand)] text-[color:var(--brand)] text-xs uppercase tracking-wider hover:bg-[color:var(--brand)] hover:text-white transition-colors whitespace-nowrap"
          >
            View reports →
          </Link>
        </header>


        <section>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="t-eyebrow">At a glance</div>
            <div className="flex flex-wrap items-center gap-4">
              <CrewFilter crews={crews} value={crewId} onChange={setCrewId} />
              <RangeToggle
                kind={kind}
                range={range}
                onChange={(k, r) => {
                  setKind(k);
                  setRange(r);
                }}
              />
            </div>
          </div>
          <KpiBand kpis={kpis} />
          {kpis.reportCount === 0 && (
            <p className="text-xs text-meta mt-6">
              No wraps captured in this range{crewId !== "all" ? " for this crew" : ""}.
            </p>
          )}
        </section>

        {longHire.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="t-eyebrow">Utilisation flags</div>
                <h2 className="t-headline mt-1">Plant on hire 4+ weeks</h2>
              </div>
              <Link to="/utilisation" className="t-eyebrow text-meta hover:text-[color:var(--brand)]">View all</Link>
            </div>
            <div className="hairline pt-4">
              <table className="w-full text-left">
                <thead>
                  <tr className="t-stat-label">
                    <th className="py-2 font-semibold">Plant</th>
                    <th className="py-2 font-semibold">Description</th>
                    <th className="py-2 font-semibold">First seen</th>
                    <th className="py-2 font-semibold">Last seen</th>
                    <th className="py-2 font-semibold">Span</th>
                    <th className="py-2 font-semibold">Active days</th>
                  </tr>
                </thead>
                <tbody>
                  {longHire.map((p) => (
                    <tr key={p.plant_id} className="border-t border-rule">
                      <td className="py-3 text-xs font-mono">{p.plant_id}</td>
                      <td className="py-3 text-xs">{p.description ?? "—"}</td>
                      <td className="py-3 text-xs">{shortDate(p.first_seen)}</td>
                      <td className="py-3 text-xs">{shortDate(p.last_seen)}</td>
                      <td className="py-3 text-xs font-semibold text-[color:var(--brand)]">{p.span_days} days</td>
                      <td className="py-3 text-xs">{p.active_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="t-eyebrow">Variations register</div>
              <h2 className="t-headline mt-1">Open flags</h2>
            </div>
            <Link to="/variations" className="t-eyebrow text-meta hover:text-[color:var(--brand)]">View all</Link>
          </div>
          <div className="hairline pt-4">
            {variations.length === 0 ? (
              <p className="text-xs text-meta py-6">No variations flagged. The bot watches for triggers in the daily wrap.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <table className="w-full text-left min-w-[560px]">
                <thead>
                  <tr className="t-stat-label">
                    <th className="py-2 font-semibold">Type</th>
                    <th className="py-2 font-semibold">Clause</th>
                    <th className="py-2 font-semibold">Description</th>
                    <th className="py-2 font-semibold">Deadline</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variations.map((v: any) => {
                    const bd = businessDaysRemaining(v.deadline_at);
                    const urgent = bd !== null && bd < 1;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => (window.location.href = `/variations/${v.id}`)}
                        className="border-t border-rule cursor-pointer hover:bg-[color:var(--accent)] transition-colors"
                      >
                        <td className="py-3 text-xs">{v.claim_type}</td>
                        <td className="py-3 text-xs font-mono">{v.clause_ref}</td>
                        <td className="py-3 text-xs max-w-md truncate">
                          {v.description ?? v.trigger_phrase ?? "—"}
                        </td>
                        <td className={`py-3 text-xs ${urgent ? "text-[color:var(--brand)] font-semibold" : ""}`}>
                          {bd === null ? "—" : bd < 0 ? `${Math.abs(bd)} BD overdue` : `${bd} BD`}
                        </td>
                        <td className="py-3 text-xs uppercase tracking-wider text-meta">{v.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="t-eyebrow mb-1">Wraps in range</div>
          <h2 className="t-headline mb-4">Daily submissions</h2>
          <div className="hairline pt-4">
            {reports.length === 0 ? (
              <p className="text-xs text-meta py-6">No reports submitted in this range.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {reports.map((r: any) => (
                  <li key={r.id} className="py-3 grid grid-cols-12 items-center gap-4">
                    <span className="col-span-2 text-xs font-semibold">{shortDate(r.report_date)}</span>
                    <span className="col-span-3 text-xs text-meta">{r.supervisors?.name ?? "—"}</span>
                    <span className="col-span-2 text-xs">{pct(r.productivity_pct)}</span>
                    <span className="col-span-2 text-xs">{aud(r.margin_aud)}</span>
                    <Link
                      to="/reports/$id"
                      params={{ id: r.id }}
                      className="col-span-3 text-right t-eyebrow text-meta hover:text-[color:var(--brand)]"
                    >
                      Open report
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
