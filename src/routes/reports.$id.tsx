import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, pct, longDate, businessDaysRemaining } from "@/lib/format";

export const Route = createFileRoute("/reports/$id")({
  head: () => ({ meta: [{ title: "Daily wrap — PACC HQ" }] }),
  component: ReportDetail,
});

type Row = Record<string, any>;

function ReportDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [showTranscript, setShowTranscript] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [works, setWorks] = useState<Row[]>([]);
  const [crew, setCrew] = useState<Row[]>([]);
  const [plant, setPlant] = useState<Row[]>([]);

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

  // Sync editable state from fetched report
  useEffect(() => {
    if (!r) return;
    setWorks(((r.works_completed as any[]) ?? []).map((x) => ({ ...x })));
    setCrew(((r.crew_hours as any[]) ?? []).map((x) => ({ ...x })));
    setPlant(((r.plant_hours as any[]) ?? []).map((x) => ({ ...x })));
  }, [r?.id, r?.updated_at]);

  const boqByRef = useMemo(() => new Map((lookups?.boq ?? []).map((b: any) => [String(b.ref), b])), [lookups]);
  const crewByName = useMemo(() => new Map((lookups?.crewReg ?? []).map((c: any) => [c.name, c])), [lookups]);
  const plantByCode = useMemo(() => new Map((lookups?.plantReg ?? []).map((p: any) => [p.plant_id_code, p])), [lookups]);
  const classesByKey = useMemo(
    () => new Map((lookups?.classes ?? []).map((c: any) => [`${c.classification}::${c.employment_type}`, c])),
    [lookups],
  );
  const pitToSp = useMemo(() => new Map((lookups?.pits ?? []).map((p: any) => [p.pit_id, p.separable_portion_code])), [lookups]);
  const spByCode = useMemo(() => new Map((lookups?.sps ?? []).map((s: any) => [s.code, s])), [lookups]);

  const portionsWorked = useMemo(() => {
    const codes = new Set<string>();
    for (const w of works) {
      const a = pitToSp.get(w.from_pit); if (a) codes.add(a);
      const b = pitToSp.get(w.to_pit); if (b) codes.add(b);
    }
    return Array.from(codes).map((c) => spByCode.get(c) ?? { code: c, name: c });
  }, [works, pitToSp, spByCode]);

  // Live totals (use editable state so the band updates as you edit)
  const totals = useMemo(() => {
    let revenue = 0;
    for (const w of works) {
      const line: any = boqByRef.get(String(w.boq_ref));
      const rate = Number(line?.rate ?? 0);
      revenue += Number(w.quantity ?? 0) * (Number(w.pct_complete ?? 0) / 100) * rate;
    }
    let cost = 0;
    for (const c of crew) {
      const reg: any = crewByName.get(c.name);
      const empType = reg?.employment_type ?? "Full Time";
      const cls: any = classesByKey.get(`${c.classification_today}::${empType}`)
        ?? classesByKey.get(`${c.classification_today}::Full Time`);
      cost += Number(c.hours_nt ?? c.nt_hours ?? 0) * Number(cls?.nt_cost_per_hr ?? 0)
            + Number(c.hours_ot ?? c.ot_hours ?? 0) * Number(cls?.ot_cost_per_hr ?? 0);
    }
    for (const p of plant) {
      const reg: any = plantByCode.get(p.plant_id ?? p.plant_id_code);
      cost += Number(p.hours_nt ?? p.nt_hours ?? 0) * Number(reg?.cost_rate_nt ?? 0)
            + Number(p.hours_ot ?? p.ot_hours ?? 0) * Number(reg?.cost_rate_ot ?? 0);
    }
    const margin = revenue - cost;
    const expected = Number((r as any)?.projects?.expected_daily_revenue_aud ?? 5000);
    const productivity = expected > 0 ? (revenue / expected) * 100 : 0;
    return { revenue, cost, margin, productivity };
  }, [works, crew, plant, boqByRef, crewByName, plantByCode, classesByKey, r]);

  // Display values: live totals while editing, persisted otherwise
  const disp = editing
    ? totals
    : {
        revenue: Number(r?.revenue_aud ?? 0),
        cost: Number(r?.cost_aud ?? 0),
        margin: Number(r?.margin_aud ?? 0),
        productivity: Number(r?.productivity_pct ?? 0),
      };

  async function handleSave() {
    if (!r) return;
    setSaving(true);
    try {
      const before = {
        works: ((r.works_completed as any[]) ?? []).length,
        crew: ((r.crew_hours as any[]) ?? []).length,
        plant: ((r.plant_hours as any[]) ?? []).length,
      };
      const after = { works: works.length, crew: crew.length, plant: plant.length };
      const diff: string[] = [];
      if (before.works !== after.works) diff.push(`works ${before.works}→${after.works}`);
      if (before.crew !== after.crew) diff.push(`crew ${before.crew}→${after.crew}`);
      if (before.plant !== after.plant) diff.push(`plant ${before.plant}→${after.plant}`);
      const summary = diff.length ? diff.join(", ") : "values edited";
      const prevEdits: any[] = ((r as any).edits as any[]) ?? [];
      const edits = [...prevEdits, { at: new Date().toISOString(), summary }];

      const { error } = await supabase
        .from("daily_reports")
        .update({
          works_completed: works,
          crew_hours: crew,
          plant_hours: plant,
          revenue_aud: totals.revenue,
          cost_aud: totals.cost,
          margin_aud: totals.margin,
          productivity_pct: totals.productivity,
          edits,
        })
        .eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["report", id] });
      setEditing(false);
    } catch (e: any) {
      alert(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!r) return;
    setWorks(((r.works_completed as any[]) ?? []).map((x) => ({ ...x })));
    setCrew(((r.crew_hours as any[]) ?? []).map((x) => ({ ...x })));
    setPlant(((r.plant_hours as any[]) ?? []).map((x) => ({ ...x })));
    setEditing(false);
  }

  if (!r) return <SiteShell section="Reports"><p className="text-xs text-meta">Loading.</p></SiteShell>;

  const editsLog: any[] = ((r as any).edits as any[]) ?? [];

  return (
    <SiteShell section="Reports">
      <div className="flex items-center justify-between">
        <Link to="/reports" className="t-eyebrow text-meta">← All reports</Link>
        <div className="flex items-center gap-3">
          {editsLog.length > 0 && !editing && (
            <span className="t-eyebrow text-meta" title={editsLog.map((e) => `${e.at}: ${e.summary}`).join("\n")}>
              Edited ×{editsLog.length}
            </span>
          )}
          {editing ? (
            <>
              <button onClick={handleCancel} className="t-eyebrow text-meta">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="t-eyebrow text-[color:var(--brand)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="t-eyebrow text-[color:var(--brand)]">Edit</button>
          )}
        </div>
      </div>

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

      <section className="hairline pt-6 grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
        <Stat label="Revenue" value={aud(disp.revenue)} tone="revenue" />
        <Stat label="Cost" value={aud(disp.cost)} tone="cost" />
        <Stat label="Margin (GP)" value={aud(disp.margin)} tone="margin" />
        <Stat
          label="GP %"
          value={disp.revenue > 0 ? pct((disp.margin / disp.revenue) * 100) : "—"}
          tone="gp"
        />
        <Stat label="Productivity" value={pct(disp.productivity)} tone="brand" />
      </section>

      {r.productivity_note && (
        <Section title="Productivity note">
          <p className="t-lead max-w-3xl py-2">{r.productivity_note}</p>
        </Section>
      )}

      <Section
        title="Works completed"
        action={editing ? (
          <button onClick={() => setWorks((xs) => [...xs, { boq_ref: "", quantity: 0, pct_complete: 100, from_pit: "", to_pit: "" }])}
            className="t-eyebrow text-[color:var(--brand)]">+ Add line</button>
        ) : null}
      >
        {works.length === 0 && !editing ? <Empty /> : (
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
                {editing && <th className="py-2 pr-3"></th>}
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
                const upd = (k: string, v: any) => setWorks((xs) => xs.map((x, j) => j === i ? { ...x, [k]: v } : x));
                return (
                  <tr key={i} className="border-t border-rule">
                    {editing ? (
                      <>
                        <td className="py-2 pr-3 font-mono">
                          <Inp value={w.from_pit ?? ""} onChange={(v) => upd("from_pit", v)} w="w-16" />
                          {" → "}
                          <Inp value={w.to_pit ?? ""} onChange={(v) => upd("to_pit", v)} w="w-16" />
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          <select value={w.boq_ref ?? ""} onChange={(e) => upd("boq_ref", e.target.value)}
                            className="bg-secondary border border-rule px-1 py-1 text-xs">
                            <option value="">—</option>
                            {(lookups?.boq ?? []).map((b: any) => (
                              <option key={b.ref} value={b.ref}>{b.ref}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-meta">{desc}</td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={w.quantity ?? 0} onChange={(v) => upd("quantity", Number(v))} w="w-20" align="right" /></td>
                        <td className="py-2 pr-3">{w.unit ?? line?.unit ?? "—"}</td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={w.pct_complete ?? 0} onChange={(v) => upd("pct_complete", Number(v))} w="w-16" align="right" /></td>
                        <td className="py-2 pr-3 text-right text-meta">{aud(rate)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{aud(rev)}</td>
                        <td className="py-2 pr-3 text-right"><RemoveBtn onClick={() => setWorks((xs) => xs.filter((_, j) => j !== i))} /></td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-3 font-mono">{run}</td>
                        <td className="py-3 pr-3 font-mono">{w.boq_ref}</td>
                        <td className="py-3 pr-3">{desc}</td>
                        <td className="py-3 pr-3 text-right">{qty}</td>
                        <td className="py-3 pr-3">{w.unit ?? line?.unit ?? "—"}</td>
                        <td className="py-3 pr-3 text-right">{pctC}%</td>
                        <td className="py-3 pr-3 text-right text-meta">{aud(rate)}</td>
                        <td className="py-3 pr-3 text-right font-semibold">{aud(rev)}</td>
                      </>
                    )}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Crew"
        action={editing ? (
          <button onClick={() => setCrew((xs) => [...xs, { name: "", classification_today: "", hours_nt: 0, hours_ot: 0 }])}
            className="t-eyebrow text-[color:var(--brand)]">+ Add crew</button>
        ) : null}
      >
        {crew.length === 0 && !editing ? <Empty /> : (
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
                {editing && <th className="py-2 pr-3"></th>}
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
                const upd = (k: string, v: any) => setCrew((xs) => xs.map((x, j) => j === i ? { ...x, [k]: v } : x));
                return (
                  <tr key={i} className="border-t border-rule">
                    {editing ? (
                      <>
                        <td className="py-2 pr-3">
                          <select value={c.name ?? ""} onChange={(e) => upd("name", e.target.value)}
                            className="bg-secondary border border-rule px-1 py-1 text-xs">
                            <option value="">—</option>
                            {(lookups?.crewReg ?? []).map((m: any) => (<option key={m.name} value={m.name}>{m.name}</option>))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <select value={c.classification_today ?? ""} onChange={(e) => upd("classification_today", e.target.value)}
                            className="bg-secondary border border-rule px-1 py-1 text-xs">
                            <option value="">—</option>
                            {Array.from(new Set((lookups?.classes ?? []).map((cl: any) => cl.classification))).map((cn) => (
                              <option key={cn as string} value={cn as string}>{cn as string}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-meta">{empType}</td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={ntH} onChange={(v) => upd("hours_nt", Number(v))} w="w-16" align="right" /></td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={otH} onChange={(v) => upd("hours_ot", Number(v))} w="w-16" align="right" /></td>
                        <td className="py-2 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{aud(cost)}</td>
                        <td className="py-2 pr-3 text-right"><RemoveBtn onClick={() => setCrew((xs) => xs.filter((_, j) => j !== i))} /></td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-3">{c.name}</td>
                        <td className="py-3 pr-3">{c.classification_today ?? reg?.role ?? "—"}</td>
                        <td className="py-3 pr-3 text-meta">{empType}</td>
                        <td className="py-3 pr-3 text-right">{ntH}</td>
                        <td className="py-3 pr-3 text-right">{otH}</td>
                        <td className="py-3 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                        <td className="py-3 pr-3 text-right font-semibold">{aud(cost)}</td>
                      </>
                    )}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Plant"
        action={editing ? (
          <button onClick={() => setPlant((xs) => [...xs, { plant_id: "", hours_nt: 0, hours_ot: 0 }])}
            className="t-eyebrow text-[color:var(--brand)]">+ Add plant</button>
        ) : null}
      >
        {plant.length === 0 && !editing ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="t-stat-label">
                <th className="py-2 pr-3">Asset</th>
                <th className="py-2 pr-3">Size class</th>
                <th className="py-2 pr-3 text-right">NT hrs</th>
                <th className="py-2 pr-3 text-right">OT hrs</th>
                <th className="py-2 pr-3 text-right">Rate (NT/OT)</th>
                <th className="py-2 pr-3 text-right">Cost</th>
                {editing && <th className="py-2 pr-3"></th>}
              </tr></thead>
              <tbody>{plant.map((p, i) => {
                const code = p.plant_id ?? p.plant_id_code;
                const reg: any = plantByCode.get(code);
                const ntRate = Number(reg?.cost_rate_nt ?? 0);
                const otRate = Number(reg?.cost_rate_ot ?? 0);
                const ntH = Number(p.hours_nt ?? p.nt_hours ?? 0);
                const otH = Number(p.hours_ot ?? p.ot_hours ?? 0);
                const cost = ntH * ntRate + otH * otRate;
                const upd = (k: string, v: any) => setPlant((xs) => xs.map((x, j) => j === i ? { ...x, [k]: v } : x));
                return (
                  <tr key={i} className="border-t border-rule">
                    {editing ? (
                      <>
                        <td className="py-2 pr-3">
                          <select value={p.plant_id ?? p.plant_id_code ?? ""} onChange={(e) => upd("plant_id", e.target.value)}
                            className="bg-secondary border border-rule px-1 py-1 text-xs">
                            <option value="">—</option>
                            {(lookups?.plantReg ?? []).map((pi: any) => (
                              <option key={pi.plant_id_code} value={pi.plant_id_code}>{pi.plant_id_code} — {pi.description}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-meta">{reg?.tonnage_class ?? "—"}</td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={ntH} onChange={(v) => upd("hours_nt", Number(v))} w="w-16" align="right" /></td>
                        <td className="py-2 pr-3 text-right"><Inp type="number" value={otH} onChange={(v) => upd("hours_ot", Number(v))} w="w-16" align="right" /></td>
                        <td className="py-2 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{aud(cost)}</td>
                        <td className="py-2 pr-3 text-right"><RemoveBtn onClick={() => setPlant((xs) => xs.filter((_, j) => j !== i))} /></td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-3">{reg?.description ?? code}</td>
                        <td className="py-3 pr-3 text-meta">{reg?.tonnage_class ?? "—"}</td>
                        <td className="py-3 pr-3 text-right">{ntH}</td>
                        <td className="py-3 pr-3 text-right">{otH}</td>
                        <td className="py-3 pr-3 text-right text-meta">{aud(ntRate)} / {aud(otRate)}</td>
                        <td className="py-3 pr-3 text-right font-semibold">{aud(cost)}</td>
                      </>
                    )}
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

      {editsLog.length > 0 && (
        <Section title="Edit history">
          <ul className="text-xs space-y-1 py-2">
            {editsLog.slice().reverse().map((e: any, i: number) => (
              <li key={i} className="text-meta">
                <span className="font-mono">{new Date(e.at).toLocaleString()}</span> — {e.summary}
              </li>
            ))}
          </ul>
        </Section>
      )}

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

const TONES: Record<string, string> = {
  revenue: "oklch(0.55 0.15 160)",
  cost: "oklch(0.50 0.05 250)",
  margin: "oklch(0.60 0.18 50)",
  gp: "oklch(0.58 0.16 290)",
  brand: "var(--brand)",
};
function Stat({ label, value, tone = "brand" }: { label: string; value: string; tone?: keyof typeof TONES }) {
  return (
    <div>
      <div className="t-stat" style={{ color: TONES[tone] }}>{value}</div>
      <div className="t-stat-label mt-2">{label}</div>
    </div>
  );
}
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-3">
        <div className="t-eyebrow">{title}</div>
        {action}
      </div>
      <div className="hairline pt-4">{children}</div>
    </section>
  );
}
function Empty({ text = "Nothing recorded." }: { text?: string }) {
  return <p className="text-xs text-meta py-4">{text}</p>;
}
function Inp({ value, onChange, type = "text", w = "w-24", align = "left" }: { value: any; onChange: (v: string) => void; type?: string; w?: string; align?: "left" | "right" }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={`${w} bg-secondary border border-rule px-1 py-1 text-xs ${align === "right" ? "text-right" : ""}`}
    />
  );
}
function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="t-eyebrow text-meta hover:text-[color:var(--brand)]">Remove</button>
  );
}
