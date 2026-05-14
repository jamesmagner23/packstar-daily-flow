import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, longDate, businessDaysRemaining } from "@/lib/format";

export const Route = createFileRoute("/reports/$id")({
  head: () => ({ meta: [{ title: "Daily wrap — PACC HQ" }] }),
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
        .select("*, supervisors(name), projects(name, code)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const projectId = (r as any)?.project_id as string | undefined;

  const { data: lookups } = useQuery({
    queryKey: ["report-lookups", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [boq, crewReg, plantReg, classes, pits, sps] = await Promise.all([
        supabase.from("boq_lines").select("ref, rate, description, material, diameter_mm, depth_band_m, unit").eq("project_id", projectId!),
        supabase.from("crew_members").select("name, employment_type, role").eq("project_id", projectId!),
        supabase.from("plant_items").select("plant_id_code, description, tonnage_class, cost_rate_nt, cost_rate_ot").eq("project_id", projectId!),
        supabase.from("classifications").select("classification, employment_type, nt_cost_per_hr, ot_cost_per_hr"),
        supabase.from("pits").select("pit_id, separable_portion_code").eq("project_id", projectId!),
        supabase.from("separable_portions").select("code, name").eq("project_id", projectId!),
      ]);
      return {
        boq: boq.data ?? [],
        crewReg: crewReg.data ?? [],
        plantReg: plantReg.data ?? [],
        classes: classes.data ?? [],
        pits: pits.data ?? [],
        sps: sps.data ?? [],
      };
    },
  });

  const { data: flags = [] } = useQuery({
    queryKey: ["report-flags", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("*, photos(id)")
        .eq("daily_report_id", id);
      return data ?? [];
    },
  });

  if (!r) return <SiteShell section="Reports"><p className="text-xs text-meta">Loading.</p></SiteShell>;

  const works: any[] = (r.works_completed as any[]) ?? [];
  const crew: any[] = (r.crew_hours as any[]) ?? [];
  const plant: any[] = (r.plant_hours as any[]) ?? [];

  const boqByRef = useMemo(() => new Map((lookups?.boq ?? []).map((b: any) => [String(b.ref), b])), [lookups]);
  const crewByName = useMemo(() => new Map((lookups?.crewReg ?? []).map((c: any) => [c.name, c])), [lookups]);
  const plantByCode = useMemo(() => new Map((lookups?.plantReg ?? []).map((p: any) => [p.plant_id_code, p])), [lookups]);
  const classesByKey = useMemo(
    () => new Map((lookups?.classes ?? []).map((c: any) => [`${c.classification}::${c.employment_type}`, c])),
    [lookups],
  );
  const pitToSp = useMemo(() => new Map((lookups?.pits ?? []).map((p: any) => [p.pit_id, p.separable_portion_code])), [lookups]);
  const spByCode = useMemo(() => new Map((lookups?.sps ?? []).map((s: any) => [s.code, s])), [lookups]);

  // Derive separable portions worked from works.from_pit / to_pit
  const portionsWorked = useMemo(() => {
    const codes = new Set<string>();
    for (const w of works) {
      const a = pitToSp.get(w.from_pit); if (a) codes.add(a);
      const b = pitToSp.get(w.to_pit); if (b) codes.add(b);
    }
    return Array.from(codes).map((c) => spByCode.get(c) ?? { code: c, name: c });
  }, [works, pitToSp, spByCode]);

  return (
    <SiteShell section="Reports">
      <Link to="/reports" className="t-eyebrow text-meta">← All reports</Link>

      <header className="mt-4 mb-10 space-y-3">
        <div className="t-eyebrow">{(r as any).projects?.code ?? ""} · {r.supervisors?.name ?? "Supervisor"}</div>
        <h1 className="t-display">{longDate(r.report_date)}</h1>
        <p className="t-lead">
          {(r as any).projects?.name ?? "—"}
          {portionsWorked.length > 0 && (
            <> · Portions worked: {portionsWorked.map((p: any) => `${p.code} ${p.name}`).join(", ")}</>
          )}
          {" · "}
          <span className={r.complete ? "text-[color:var(--brand)]" : "text-meta"}>
            {r.complete ? "Complete" : "Draft"}
          </span>
        </p>
      </header>

      <section className="hairline pt-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        <Stat label="Revenue" value={aud(r.revenue_aud)} />
        <Stat label="Cost" value={aud(r.cost_aud)} />
        <Stat label="Margin" value={aud(r.margin_aud)} />
        <Stat label="Productivity" value={pct(r.productivity_pct)} />
      </section>

      {r.productivity_note && (
        <Section title="Productivity note">
          <p className="t-lead max-w-3xl py-2">{r.productivity_note}</p>
        </Section>
      )}

      <Section title="Works completed">
        {works.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="t-stat-label">
                <th className="py-2 pr-3">Run</th>
                <th className="py-2 pr-3">BOQ</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3 text-right">% done</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 pr-3 text-right">Revenue</th>
              </tr></thead>
              <tbody>{works.map((w, i) => {
                const line: any = boqByRef.get(String(w.boq_ref));
                const rate = Number(line?.rate ?? 0);
                const qty = Number(w.quantity ?? 0);
                const pctC = Number(w.pct_complete ?? 0);
                const rev = qty * (pctC / 100) * rate;
                const desc = [line?.material, line?.diameter_mm ? `${line.diameter_mm}mm` : null, line?.depth_band_m ? `${line.depth_band_m}m deep` : null]
                  .filter(Boolean).join(" · ") || line?.description || "—";
                const run = w.to_pit ? `${w.from_pit ?? "—"} → ${w.to_pit}` : (w.from_pit ?? "—");
                return (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-3 pr-3 font-mono">{run}</td>
                    <td className="py-3 pr-3 font-mono">{w.boq_ref}</td>
                    <td className="py-3 pr-3">{desc}</td>
                    <td className="py-3 pr-3 text-right">{qty}</td>
                    <td className="py-3 pr-3">{w.unit ?? line?.unit ?? "—"}</td>
                    <td className="py-3 pr-3 text-right">{pctC}%</td>
                    <td className="py-3 pr-3 text-right text-meta">{aud(rate)}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{aud(rev)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Crew">
        {crew.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="t-stat-label">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Classification</th>
                <th className="py-2 pr-3">Employment</th>
                <th className="py-2 pr-3 text-right">NT hrs</th>
                <th className="py-2 pr-3 text-right">OT hrs</th>
                <th className="py-2 pr-3 text-right">Rate (NT/OT)</th>
                <th className="py-2 pr-3 text-right">Cost</th>
              </tr></thead>
              <tbody>{crew.map((c, i) => {
                const reg: any = crewByName.get(c.name);
                const empType = reg?.employment_type ?? "Full Time";
                const cls: any = classesByKey.get(`${c.classification_today}::${empType}`)
                  ?? classesByKey.get(`${c.classification_today}::Full Time`);
                const ntRate = Number(cls?.nt_cost_per_hr ?? 0);
                const otRate = Number(cls?.ot_cost_per_hr ?? 0);
                const ntH = Number(c.hours_nt ?? c.nt_hours ?? 0);
                const otH = Number(c.hours_ot ?? c.ot_hours ?? 0);
                const cost = ntH * ntRate + otH * otRate;
                return (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-3 pr-3">{c.name}</td>
                    <td className="py-3 pr-3">{c.classification_today ?? reg?.role ?? "—"}</td>
                    <td className="py-3 pr-3 text-meta">{empType}</td>
                    <td className="py-3 pr-3 text-right">{ntH}</td>
                    <td className="py-3 pr-3 text-right">{otH}</td>
                    <td className="py-3 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{aud(cost)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Plant">
        {plant.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="t-stat-label">
                <th className="py-2 pr-3">Asset</th>
                <th className="py-2 pr-3">Size class</th>
                <th className="py-2 pr-3 text-right">NT hrs</th>
                <th className="py-2 pr-3 text-right">OT hrs</th>
                <th className="py-2 pr-3 text-right">Rate (NT/OT)</th>
                <th className="py-2 pr-3 text-right">Cost</th>
              </tr></thead>
              <tbody>{plant.map((p, i) => {
                const code = p.plant_id ?? p.plant_id_code;
                const reg: any = plantByCode.get(code);
                const ntRate = Number(reg?.cost_rate_nt ?? 0);
                const otRate = Number(reg?.cost_rate_ot ?? 0);
                const ntH = Number(p.hours_nt ?? p.nt_hours ?? 0);
                const otH = Number(p.hours_ot ?? p.ot_hours ?? 0);
                const cost = ntH * ntRate + otH * otRate;
                return (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-3 pr-3">{reg?.description ?? code}</td>
                    <td className="py-3 pr-3 text-meta">{reg?.tonnage_class ?? "—"}</td>
                    <td className="py-3 pr-3 text-right">{ntH}</td>
                    <td className="py-3 pr-3 text-right">{otH}</td>
                    <td className="py-3 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{aud(cost)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Variation flags">
        {flags.length === 0 ? <Empty text="Nothing flagged today." /> : (
          <ul className="divide-y divide-rule">
            {flags.map((f: any) => {
              const bd = businessDaysRemaining(f.deadline_at);
              const photoCount = Array.isArray(f.photos) ? f.photos.length : 0;
              return (
                <li key={f.id} className="py-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs">
                      <span className="font-semibold">{f.claim_type}</span>
                      <span className="text-meta"> · </span>
                      <span className="font-mono">{f.clause_ref}</span>
                    </div>
                    <Link to="/variations/$id" params={{ id: f.id }} className="t-eyebrow text-meta hover:text-[color:var(--brand)]">Open</Link>
                  </div>
                  {f.trigger_phrase && (
                    <p className="text-xs text-meta italic">"{f.trigger_phrase}"</p>
                  )}
                  {f.description && <p className="text-xs">{f.description}</p>}
                  <div className="text-xs text-meta grid grid-cols-2 md:grid-cols-5 gap-2">
                    <span>Deadline: <span className={bd !== null && bd < 1 ? "text-[color:var(--brand)] font-semibold" : ""}>
                      {bd === null ? "—" : bd < 0 ? `${Math.abs(bd)} BD overdue` : `${bd} BD`}
                    </span></span>
                    <span>Photos: {photoCount}</span>
                    <span>Duration impact: {f.duration_impact_hours ?? 0}h</span>
                    <span>HC rep saw: {f.symal_rep_saw === true ? "Yes" : f.symal_rep_saw === false ? "No" : "—"}</span>
                    <span>Notice: {f.notice_sent_at ? "Sent" : "Pending"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Slack transcript">
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="text-xs t-eyebrow text-meta hover:text-[color:var(--brand)]"
        >
          {showTranscript ? "Hide transcript" : "Show transcript"}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-stat">{value}</div>
      <div className="t-stat-label mt-2">{label}</div>
    </div>
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
