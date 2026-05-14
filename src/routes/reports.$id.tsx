import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, longDate, businessDaysRemaining, shortDate } from "@/lib/format";

export const Route = createFileRoute("/reports/$id")({
  head: () => ({ meta: [{ title: "Daily wrap — PackHQ" }] }),
  component: ReportDetail,
});

function ReportDetail() {
  const { id } = Route.useParams();
  const [showTranscript, setShowTranscript] = useState(false);

  const { data: r } = useQuery({
    queryKey: ["report", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("*, supervisors(name)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: flags = [] } = useQuery({
    queryKey: ["report-flags", id],
    queryFn: async () => {
      const { data } = await supabase.from("variation_flags").select("*").eq("daily_report_id", id);
      return data ?? [];
    },
  });

  if (!r) return <SiteShell section="Reports"><p className="text-xs text-meta">Loading.</p></SiteShell>;

  const works: any[] = (r.works_completed as any[]) ?? [];
  const crew: any[] = (r.crew_hours as any[]) ?? [];
  const plant: any[] = (r.plant_hours as any[]) ?? [];

  return (
    <SiteShell section="Reports">
      <Link to="/reports" className="t-eyebrow text-meta">← All reports</Link>
      <header className="mt-4 mb-10">
        <div className="t-eyebrow">{r.supervisors?.name ?? "Supervisor"}</div>
        <h1 className="t-display mt-2">{longDate(r.report_date)}</h1>
      </header>

      <section className="hairline pt-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        <div><div className="t-stat">{aud(r.revenue_aud)}</div><div className="t-stat-label mt-2">Revenue</div></div>
        <div><div className="t-stat">{aud(r.cost_aud)}</div><div className="t-stat-label mt-2">Cost</div></div>
        <div><div className="t-stat">{aud(r.margin_aud)}</div><div className="t-stat-label mt-2">Margin</div></div>
        <div><div className="t-stat">{pct(r.productivity_pct)}</div><div className="t-stat-label mt-2">Productivity</div></div>
      </section>

      {r.productivity_note && (
        <p className="t-lead mb-12 max-w-3xl">{r.productivity_note}</p>
      )}

      <Section title="Works completed">
        {works.length === 0 ? <Empty /> : (
          <table className="w-full text-left">
            <thead><tr className="t-stat-label"><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2">Unit</th><th className="py-2">Notes</th></tr></thead>
            <tbody>{works.map((w, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-3 text-xs">{w.description ?? w.ref}</td>
                <td className="py-3 text-xs">{w.quantity}</td>
                <td className="py-3 text-xs">{w.unit}</td>
                <td className="py-3 text-xs text-meta">{w.notes ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title="Crew">
        {crew.length === 0 ? <Empty /> : (
          <table className="w-full text-left">
            <thead><tr className="t-stat-label"><th className="py-2">Name</th><th className="py-2">Role</th><th className="py-2">NT hrs</th><th className="py-2">OT hrs</th></tr></thead>
            <tbody>{crew.map((c, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-3 text-xs">{c.name}</td>
                <td className="py-3 text-xs">{c.role}</td>
                <td className="py-3 text-xs">{c.nt_hours ?? 0}</td>
                <td className="py-3 text-xs">{c.ot_hours ?? 0}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title="Plant">
        {plant.length === 0 ? <Empty /> : (
          <table className="w-full text-left">
            <thead><tr className="t-stat-label"><th className="py-2">Plant ID</th><th className="py-2">NT hrs</th><th className="py-2">OT hrs</th></tr></thead>
            <tbody>{plant.map((p, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-3 text-xs font-mono">{p.plant_id_code ?? p.id}</td>
                <td className="py-3 text-xs">{p.nt_hours ?? 0}</td>
                <td className="py-3 text-xs">{p.ot_hours ?? 0}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title="Variation flags">
        {flags.length === 0 ? <Empty text="Nothing flagged today." /> : (
          <ul className="divide-y divide-rule">
            {flags.map((f) => {
              const bd = businessDaysRemaining(f.deadline_at);
              return (
                <li key={f.id} className="py-3 grid grid-cols-12 gap-3 items-center">
                  <span className="col-span-3 text-xs">{f.claim_type}</span>
                  <span className="col-span-2 text-xs font-mono">{f.clause_ref}</span>
                  <span className="col-span-4 text-xs">{f.description ?? f.trigger_phrase}</span>
                  <span className="col-span-2 text-xs text-[color:var(--brand)]">{bd === null ? "—" : bd < 0 ? `${Math.abs(bd)} BD overdue` : `${bd} BD`}</span>
                  <Link to="/variations/$id" params={{ id: f.id }} className="col-span-1 text-right t-eyebrow text-meta hover:text-[color:var(--brand)]">Open</Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Slack transcript">
        <button onClick={() => setShowTranscript((v) => !v)} className="text-xs t-eyebrow text-meta hover:text-[color:var(--brand)]">
          {showTranscript ? "Hide" : "Show"}
        </button>
        {showTranscript && (
          <pre className="mt-4 text-xs whitespace-pre-wrap font-sans bg-secondary p-5 border border-rule">
            {r.raw_transcript ?? "No transcript captured."}
          </pre>
        )}
      </Section>
    </SiteShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="t-eyebrow mb-3">{title}</div>
      <div className="hairline pt-4">{children}</div>
    </section>
  );
}
function Empty({ text = "Nothing recorded." }: { text?: string }) {
  return <p className="text-xs text-meta py-4">{text}</p>;
}
