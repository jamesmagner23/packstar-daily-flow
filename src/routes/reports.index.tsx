import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, shortDate } from "@/lib/format";
import { useActiveProjectId } from "@/hooks/use-active-project";

export const Route = createFileRoute("/reports/")({
  head: () => ({ meta: [{ title: "Daily reports — PACC HQ" }] }),
  component: ReportsList,
});

function ReportsList() {
  const activeProjectId = useActiveProjectId();

  const { data: project } = useQuery({
    queryKey: ["reports-project", activeProjectId],
    queryFn: async () => {
      if (activeProjectId) {
        const { data } = await supabase.from("projects").select("id, code, name").eq("id", activeProjectId).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.from("projects").select("id, code, name").eq("active", true).order("code").limit(1).maybeSingle();
      return data;
    },
  });

  const projectId = project?.id as string | undefined;

  const { data = [] } = useQuery({
    queryKey: ["reports-all", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, productivity_pct, revenue_aud, cost_aud, margin_aud, complete, email_sent_at, supervisors(name)")
        .eq("project_id", projectId!)
        .order("report_date", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  const { data: flagCounts = {} } = useQuery({
    queryKey: ["reports-flag-counts", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("daily_report_id")
        .eq("project_id", projectId!)
        .not("daily_report_id", "is", null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.daily_report_id) counts[r.daily_report_id] = (counts[r.daily_report_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  function statusFor(r: any): { label: string; tone: "sent" | "flagged" | "ready" | "draft" } {
    const flags = flagCounts[r.id] ?? 0;
    if (flags > 0) return { label: `${flags} variation${flags > 1 ? "s" : ""} flagged`, tone: "flagged" };
    if (r.email_sent_at) return { label: "Sent", tone: "sent" };
    if (r.complete) return { label: "Ready", tone: "ready" };
    return { label: "Draft", tone: "draft" };
  }

  const toneClass: Record<string, string> = {
    sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ready: "bg-blue-50 text-blue-700 border-blue-200",
    flagged: "bg-amber-50 text-amber-800 border-amber-200",
    draft: "bg-zinc-50 text-meta border-rule",
  };

  return (
    <SiteShell section="Reports">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="t-eyebrow">{project?.code ?? "End of day"}</div>
          <h1 className="t-display mt-2">Daily wraps</h1>
          <p className="t-lead mt-3">{project?.name ? `${project.name}. ` : ""}Captured via Slack. Productivity and margin computed against the BOQ.</p>
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
              {data.map((r: any) => {
                const s = statusFor(r);
                return (
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
                    <td className="py-3 text-xs">
                      <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] uppercase tracking-wider ${toneClass[s.tone]}`}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SiteShell>
  );
}

