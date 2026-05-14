import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, shortDate, businessDaysRemaining } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PACC HQ — PACC operational dashboard" },
      { name: "description", content: "Daily P&L, productivity, and variations register for PACC project sites." },
    ],
  }),
  component: Dashboard,
});

function StatCard({ label, value, tone = "brand" }: { label: string; value: string; tone?: "brand" | "revenue" | "cost" | "margin" | "gp" }) {
  const colorMap: Record<string, string> = {
    brand: "var(--brand)",
    revenue: "oklch(0.55 0.15 160)",   // emerald
    cost: "oklch(0.50 0.05 250)",      // slate blue
    margin: "oklch(0.60 0.18 50)",     // amber/gold
    gp: "oklch(0.58 0.16 290)",        // violet
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="t-stat" style={{ color: colorMap[tone] }}>{value}</div>
      <div className="t-stat-label">{label}</div>
    </div>
  );
}

function Dashboard() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: project } = useQuery({
    queryKey: ["project-active"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("active", true).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: today } = useQuery({
    queryKey: ["report-today", todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("*, supervisors(name)")
        .eq("report_date", todayStr)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: recentReports = [] } = useQuery({
    queryKey: ["reports-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, productivity_pct, margin_aud, revenue_aud, supervisors(name)")
        .order("report_date", { ascending: false })
        .limit(7);
      return data ?? [];
    },
  });

  const { data: variations = [] } = useQuery({
    queryKey: ["variations-open"],
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("*")
        .neq("status", "closed")
        .order("deadline_at", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  return (
    <SiteShell section="Dashboard">
      <div className="space-y-12">
        <header className="space-y-3">
          <div className="t-eyebrow">{project?.code ?? "No project loaded"}</div>
          <h1 className="t-display">{project?.name ?? "Connect a project to begin"}</h1>
          {project?.head_contractor && (
            <p className="t-lead">Head contractor {project.head_contractor}. {shortDate(new Date())}.</p>
          )}
        </header>

        <section>
          <div className="t-eyebrow mb-4">Today at a glance</div>
          <div className="hairline pt-6 grid grid-cols-2 md:grid-cols-5 gap-8">
            <StatCard label="Revenue" value={aud(today?.revenue_aud)} tone="revenue" />
            <StatCard label="Cost" value={aud(today?.cost_aud)} tone="cost" />
            <StatCard label="Margin (GP)" value={aud(today?.margin_aud)} tone="margin" />
            <StatCard
              label="GP %"
              value={today?.revenue_aud && Number(today.revenue_aud) > 0
                ? pct((Number(today.margin_aud ?? 0) / Number(today.revenue_aud)) * 100)
                : "—"}
              tone="gp"
            />
            <StatCard label="Productivity" value={pct(today?.productivity_pct)} />
          </div>
          {!today && (
            <p className="text-xs text-meta mt-6">
              No wrap submitted yet for {shortDate(new Date())}. Blake gets the Slack prompt at 4.30pm.
            </p>
          )}
        </section>

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
              <table className="w-full text-left">
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
                  {variations.map((v) => {
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
            )}
          </div>
        </section>

        <section>
          <div className="t-eyebrow mb-1">Recent wraps</div>
          <h2 className="t-headline mb-4">Last seven working days</h2>
          <div className="hairline pt-4">
            {recentReports.length === 0 ? (
              <p className="text-xs text-meta py-6">No reports yet.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {recentReports.map((r: any) => (
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
