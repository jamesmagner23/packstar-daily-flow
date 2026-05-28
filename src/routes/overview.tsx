import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { RangeToggle } from "@/components/RangeToggle";
import { KpiBand } from "@/components/KpiBand";
import { aud, pct, shortDate } from "@/lib/format";
import {
  type DateRange,
  type RangeKind,
  getWeekRange,
  workingDaysInRange,
} from "@/lib/date-range";
import { aggregateKpis } from "@/lib/reports-aggregate";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Business overview — PACC HQ" },
      { name: "description", content: "Whole-of-business productivity, margin and profit across all PACC projects." },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const [kind, setKind] = useState<RangeKind>("week");
  const [range, setRange] = useState<DateRange>(() => getWeekRange());

  const { data: projects = [] } = useQuery({
    queryKey: ["overview-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, code, name, expected_daily_revenue_aud, active")
        .eq("active", true)
        .order("code");
      return (data ?? []) as {
        id: string; code: string; name: string;
        expected_daily_revenue_aud: number | null; active: boolean | null;
      }[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["overview-reports", range.from, range.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, project_id, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, plant_hours")
        .gte("report_date", range.from)
        .lte("report_date", range.to)
        .order("report_date", { ascending: false });
      return data ?? [];
    },
  });

  const workingDays = workingDaysInRange(range);

  // Sum of every active project's expected daily revenue × working days
  const expectedDailyTotal = useMemo(
    () => projects.reduce((s, p) => s + Number(p.expected_daily_revenue_aud ?? 5000), 0),
    [projects],
  );

  const kpis = useMemo(
    () => aggregateKpis(reports as any, expectedDailyTotal, workingDays),
    [reports, expectedDailyTotal, workingDays],
  );

  const perProject = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; margin: number; count: number }>();
    for (const r of reports as any[]) {
      const id = r.project_id as string | null;
      if (!id) continue;
      const cur = map.get(id) ?? { revenue: 0, cost: 0, margin: 0, count: 0 };
      cur.revenue += Number(r.revenue_aud ?? 0);
      cur.cost += Number(r.cost_aud ?? 0);
      cur.margin += Number(r.margin_aud ?? 0);
      cur.count += 1;
      map.set(id, cur);
    }
    return projects
      .map((p) => {
        const t = map.get(p.id) ?? { revenue: 0, cost: 0, margin: 0, count: 0 };
        const expected = Number(p.expected_daily_revenue_aud ?? 5000) * Math.max(workingDays, 1);
        const productivity = expected > 0 ? (t.revenue / expected) * 100 : null;
        const gp = t.revenue > 0 ? (t.margin / t.revenue) * 100 : null;
        return { ...p, ...t, productivity, gp, expected };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [projects, reports, workingDays]);

  return (
    <SiteShell section="Overview">
      <div className="space-y-12">
        <header className="space-y-3">
          <div className="t-eyebrow">Business overview</div>
          <h1 className="t-display">All projects</h1>
          <p className="t-lead">
            {projects.length} active project{projects.length === 1 ? "" : "s"} ·{" "}
            {shortDate(range.from)} – {shortDate(range.to)} · {workingDays} working day{workingDays === 1 ? "" : "s"}
          </p>
        </header>

        <section>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="t-eyebrow">At a glance</div>
            <RangeToggle
              kind={kind}
              range={range}
              onChange={(k, r) => { setKind(k); setRange(r); }}
            />
          </div>
          <KpiBand kpis={kpis} />
          {kpis.reportCount === 0 && (
            <p className="text-xs text-meta mt-6">No wraps captured in this range across any project.</p>
          )}
        </section>

        <section>
          <div className="t-eyebrow mb-1">By project</div>
          <h2 className="t-headline mb-4">Revenue · margin · productivity</h2>
          <div className="hairline pt-4 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="t-stat-label">
                  <th className="py-2 font-semibold">Project</th>
                  <th className="py-2 font-semibold text-right">Wraps</th>
                  <th className="py-2 font-semibold text-right">Revenue</th>
                  <th className="py-2 font-semibold text-right">Cost</th>
                  <th className="py-2 font-semibold text-right">Margin</th>
                  <th className="py-2 font-semibold text-right">GP %</th>
                  <th className="py-2 font-semibold text-right">Productivity</th>
                </tr>
              </thead>
              <tbody>
                {perProject.map((p) => (
                  <tr key={p.id} className="border-t border-rule">
                    <td className="py-3 text-xs">
                      <div className="font-semibold">{p.code}</div>
                      <div className="text-meta">{p.name}</div>
                    </td>
                    <td className="py-3 text-xs text-right">{p.count}</td>
                    <td className="py-3 text-xs text-right">{aud(p.revenue)}</td>
                    <td className="py-3 text-xs text-right">{aud(p.cost)}</td>
                    <td className="py-3 text-xs text-right font-semibold">{aud(p.margin)}</td>
                    <td className="py-3 text-xs text-right">{pct(p.gp)}</td>
                    <td className="py-3 text-xs text-right">{pct(p.productivity)}</td>
                  </tr>
                ))}
                {perProject.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-xs text-meta text-center">No active projects.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
