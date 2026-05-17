import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, shortDate } from "@/lib/format";

export const Route = createFileRoute("/reports/")({
  head: () => ({ meta: [{ title: "Daily reports — PACC HQ" }] }),
  component: ReportsList,
});

function ReportsList() {
  const { data = [] } = useQuery({
    queryKey: ["reports-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, productivity_pct, revenue_aud, cost_aud, margin_aud, complete, supervisors(name)")
        .order("report_date", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  return (
    <SiteShell section="Reports">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="t-eyebrow">End of day</div>
          <h1 className="t-display mt-2">Daily wraps</h1>
          <p className="t-lead mt-3">Captured by Blake via Slack. Productivity and margin computed against the BOQ.</p>
        </div>
        <Link to="/reports/export" className="t-eyebrow text-[color:var(--brand)] whitespace-nowrap">Export PDF →</Link>
      </header>
      <div className="hairline pt-6">
        {data.length === 0 ? (
          <p className="text-xs text-meta py-8">No reports yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Supervisor</th>
                <th className="py-2 font-semibold">Productivity</th>
                <th className="py-2 font-semibold">Revenue</th>
                <th className="py-2 font-semibold">Margin</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-3 text-xs">
                    <Link to="/reports/$id" params={{ id: r.id }} className="hover:text-[color:var(--brand)]">
                      {shortDate(r.report_date)}
                    </Link>
                  </td>
                  <td className="py-3 text-xs">{r.supervisors?.name ?? "—"}</td>
                  <td className="py-3 text-xs">{pct(r.productivity_pct)}</td>
                  <td className="py-3 text-xs">{aud(r.revenue_aud)}</td>
                  <td className="py-3 text-xs">{aud(r.margin_aud)}</td>
                  <td className="py-3 text-xs uppercase tracking-wider text-meta">{r.complete ? "Complete" : "Draft"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SiteShell>
  );
}
