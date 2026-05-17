import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { RangeToggle } from "@/components/RangeToggle";
import { aud, shortDate } from "@/lib/format";
import {
  type DateRange,
  type RangeKind,
  getMonthRange,
} from "@/lib/date-range";
import { aggregateBoqRevenue, detectLongHire } from "@/lib/reports-aggregate";

export const Route = createFileRoute("/utilisation/")({
  head: () => ({ meta: [{ title: "Utilisation — PACC HQ" }] }),
  component: UtilisationPage,
});

function UtilisationPage() {
  const [kind, setKind] = useState<RangeKind>("month");
  const [range, setRange] = useState<DateRange>(() => getMonthRange());

  const { data: project } = useQuery({
    queryKey: ["project-active"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id").eq("active", true).limit(1).maybeSingle();
      return data;
    },
  });
  const projectId = project?.id as string | undefined;

  const { data: reports = [] } = useQuery({
    queryKey: ["util-reports", projectId, range.from, range.to],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, plant_hours")
        .eq("project_id", projectId!)
        .gte("report_date", range.from)
        .lte("report_date", range.to);
      return data ?? [];
    },
  });

  const { data: hireWindow = [] } = useQuery({
    queryKey: ["util-hire-window", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data } = await supabase
        .from("daily_reports")
        .select("id, report_date, supervisor_id, revenue_aud, cost_aud, margin_aud, productivity_pct, works_completed, plant_hours")
        .eq("project_id", projectId!)
        .gte("report_date", since.toISOString().slice(0, 10));
      return data ?? [];
    },
  });

  const { data: boq = [] } = useQuery({
    queryKey: ["boq", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("boq_lines")
        .select("ref, rate, description")
        .eq("project_id", projectId!);
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

  const contributions = useMemo(
    () => aggregateBoqRevenue(reports as any, boq as any).filter((c) => c.revenue > 0),
    [reports, boq],
  );
  const top = contributions.slice(0, 8);
  const bottom = contributions.slice(-8).reverse();
  const longHire = useMemo(
    () => detectLongHire(hireWindow as any, plantReg as any, 28, 3),
    [hireWindow, plantReg],
  );

  return (
    <SiteShell section="Utilisation">
      <header className="mb-10">
        <div className="t-eyebrow">Operations</div>
        <h1 className="t-display mt-2">Utilisation</h1>
        <p className="t-lead mt-3">Where the revenue is coming from, and what's sitting on hire too long.</p>
      </header>

      <div className="mb-8">
        <RangeToggle
          kind={kind}
          range={range}
          onChange={(k, r) => {
            setKind(k);
            setRange(r);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
        <section>
          <div className="t-eyebrow mb-1">Top revenue contributors</div>
          <h2 className="t-headline mb-4">By BOQ line</h2>
          <div className="hairline pt-4">
            {top.length === 0 ? (
              <p className="text-xs text-meta py-6">No completed works in this range.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="t-stat-label">
                    <th className="py-2 font-semibold">Ref</th>
                    <th className="py-2 font-semibold">Description</th>
                    <th className="py-2 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.boq_ref} className="border-t border-rule">
                      <td className="py-3 text-xs font-mono">{c.boq_ref}</td>
                      <td className="py-3 text-xs">{c.description ?? "—"}</td>
                      <td className="py-3 text-xs text-right font-semibold">{aud(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <div className="t-eyebrow mb-1">Bottom contributors</div>
          <h2 className="t-headline mb-4">Lowest revenue lines</h2>
          <div className="hairline pt-4">
            {bottom.length === 0 ? (
              <p className="text-xs text-meta py-6">—</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="t-stat-label">
                    <th className="py-2 font-semibold">Ref</th>
                    <th className="py-2 font-semibold">Description</th>
                    <th className="py-2 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {bottom.map((c) => (
                    <tr key={c.boq_ref} className="border-t border-rule">
                      <td className="py-3 text-xs font-mono">{c.boq_ref}</td>
                      <td className="py-3 text-xs">{c.description ?? "—"}</td>
                      <td className="py-3 text-xs text-right">{aud(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section>
        <div className="t-eyebrow mb-1">Long-hire plant</div>
        <h2 className="t-headline mb-4">On hire 4+ weeks (rolling 90 day scan)</h2>
        <div className="hairline pt-4">
          {longHire.length === 0 ? (
            <p className="text-xs text-meta py-6">Nothing flagged.</p>
          ) : (
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
          )}
        </div>
      </section>
    </SiteShell>
  );
}
