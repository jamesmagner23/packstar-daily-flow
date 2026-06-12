import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud, shortDate } from "@/lib/format";
import { setDaywokStatus } from "@/lib/dayworks.functions";

export const Route = createFileRoute("/dayworks/$id")({
  head: () => ({ meta: [{ title: "Daywork — PACC HQ" }] }),
  component: DayworkEditor,
});

type LineType = "plant" | "labour" | "material";
type Unit = "hr" | "day" | "ea" | "m" | "m2" | "m3" | "t" | "L" | "wk";

interface Line {
  id: string;
  daywork_id: string;
  line_type: LineType;
  plant_rate_card_id: string | null;
  classification_id: string | null;
  description: string;
  quantity: number;
  unit: Unit;
  client_rate_aud: number;
  cost_rate_aud: number;
  revenue_aud: number | null;
  cost_aud: number | null;
  sort_order: number;
}

function DayworkEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const statusFn = useServerFn(setDaywokStatus);

  const { data: dw } = useQuery({
    queryKey: ["daywork", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("dayworks")
        .select("*, projects(id, code, name)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["daywork-lines", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("daywork_lines")
        .select("*")
        .eq("daywork_id", id)
        .order("sort_order");
      return (data ?? []) as unknown as Line[];
    },
  });

  const { data: plantRates = [] } = useQuery({
    queryKey: ["plant-rate-card"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_hire_rate_card")
        .select("id, size_class, type, wet_hire_nt_hr, dry_hire_daily")
        .eq("active", true)
        .order("size_class");
      return data ?? [];
    },
  });

  const { data: classifications = [] } = useQuery({
    queryKey: ["classifications-for-dayworks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("classifications")
        .select("id, classification, employment_type, nt_cost_per_hr")
        .eq("active", true)
        .order("classification");
      return data ?? [];
    },
  });

  const { data: labourRates = [] } = useQuery({
    queryKey: ["labour-rates-for-dayworks", dw?.project_id],
    enabled: !!dw?.project_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("labour_hire_rates")
        .select("id, classification_id, kind, description, nt_rate, ot_rate")
        .eq("project_id", dw!.project_id as string)
        .eq("active", true);
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const rev = lines.reduce((a, l) => a + Number(l.revenue_aud ?? 0), 0);
    const cost = lines.reduce((a, l) => a + Number(l.cost_aud ?? 0), 0);
    return { rev, cost, margin: rev - cost };
  }, [lines]);

  const addLine = useMutation({
    mutationFn: async (line_type: LineType) => {
      const sort = lines.length;
      await supabase.from("daywork_lines").insert({
        daywork_id: id,
        line_type,
        description: line_type === "plant" ? "Plant" : line_type === "labour" ? "Labour" : "Material",
        quantity: line_type === "plant" || line_type === "labour" ? 8 : 1,
        unit: line_type === "material" ? "ea" : "hr",
        client_rate_aud: 0,
        cost_rate_aud: 0,
        sort_order: sort,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daywork-lines", id] }),
  });

  const updateLine = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Line> }) => {
      await supabase.from("daywork_lines").update(vars.patch).eq("id", vars.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daywork-lines", id] }),
  });

  const deleteLine = useMutation({
    mutationFn: async (lineId: string) => {
      await supabase.from("daywork_lines").delete().eq("id", lineId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daywork-lines", id] }),
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { status: "draft" | "awaiting_signature" | "signed" | "void"; method?: "in_app" | "offline" }) => {
      await statusFn({ data: { id, status: vars.status, signing_method: vars.method ?? null } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daywork", id] }),
  });

  const uploadSigned = useMutation({
    mutationFn: async (file: File) => {
      const path = `${id}/signed-${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("daywork-dockets").upload(path, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: signed } = await supabase.storage.from("daywork-dockets").createSignedUrl(path, 60 * 60 * 24 * 365);
      await statusFn({
        data: {
          id,
          status: "signed",
          signing_method: "offline",
          signed_docket_pdf_url: signed?.signedUrl ?? path,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daywork", id] }),
  });

  if (!dw) {
    return (
      <SiteShell section="Dayworks">
        <p className="text-xs text-meta">Loading…</p>
      </SiteShell>
    );
  }

  const project = (dw as { projects: { code: string; name: string } | null }).projects;
  const isLocked = dw.status === "signed" || dw.status === "void";

  return (
    <SiteShell section="Dayworks">
      <header className="mb-8">
        <div className="t-eyebrow">{project?.code} · {shortDate(dw.work_date)}</div>
        <div className="flex items-baseline justify-between gap-4 mt-2">
          <h1 className="t-display font-mono">{dw.reference}</h1>
          <Link to="/dayworks" className="text-xs text-meta hover:text-ink">← All dayworks</Link>
        </div>
        <p className="t-lead mt-3 max-w-2xl">{dw.description ?? "No description."}</p>
      </header>

      {/* Header fields */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 border border-rule p-4 bg-neutral-50">
        <Field label="Work date">
          <input
            type="date"
            value={dw.work_date}
            disabled={isLocked}
            onChange={async (e) => {
              await supabase.from("dayworks").update({ work_date: e.target.value }).eq("id", id);
              qc.invalidateQueries({ queryKey: ["daywork", id] });
            }}
            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
          />
        </Field>
        <Field label="Client contact name">
          <input
            type="text"
            defaultValue={dw.client_contact_name ?? ""}
            disabled={isLocked}
            onBlur={(e) => supabase.from("dayworks").update({ client_contact_name: e.target.value || null }).eq("id", id)}
            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
          />
        </Field>
        <Field label="Client contact email">
          <input
            type="email"
            defaultValue={dw.client_contact_email ?? ""}
            disabled={isLocked}
            onBlur={(e) => supabase.from("dayworks").update({ client_contact_email: e.target.value || null }).eq("id", id)}
            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
          />
        </Field>
        <Field label="Description / scope">
          <textarea
            defaultValue={dw.description ?? ""}
            disabled={isLocked}
            rows={2}
            onBlur={(e) => supabase.from("dayworks").update({ description: e.target.value || null }).eq("id", id)}
            className="border border-rule px-2 py-1.5 bg-white text-xs w-full md:col-span-3"
          />
        </Field>
      </section>

      {/* Lines */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="t-headline">Docket lines</h2>
          {!isLocked && (
            <div className="flex gap-2">
              <button type="button" onClick={() => addLine.mutate("plant")} className="text-xs px-2.5 py-1.5 border border-rule hover:bg-neutral-50">+ Plant</button>
              <button type="button" onClick={() => addLine.mutate("labour")} className="text-xs px-2.5 py-1.5 border border-rule hover:bg-neutral-50">+ Labour</button>
              <button type="button" onClick={() => addLine.mutate("material")} className="text-xs px-2.5 py-1.5 border border-rule hover:bg-neutral-50">+ Material</button>
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="text-xs text-meta py-6 hairline pt-6">No lines yet. Add plant, labour, or materials above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="t-stat-label">
                  <th className="py-2 font-semibold w-24">Type</th>
                  <th className="py-2 font-semibold">Item / description</th>
                  <th className="py-2 font-semibold text-right w-20">Qty</th>
                  <th className="py-2 font-semibold w-20">Unit</th>
                  <th className="py-2 font-semibold text-right w-28">Client rate</th>
                  <th className="py-2 font-semibold text-right w-28">Cost rate</th>
                  <th className="py-2 font-semibold text-right w-28">Revenue</th>
                  <th className="py-2 font-semibold text-right w-28">Margin</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const rev = Number(l.revenue_aud ?? l.quantity * l.client_rate_aud);
                  const cost = Number(l.cost_aud ?? l.quantity * l.cost_rate_aud);
                  return (
                    <tr key={l.id} className="border-t border-rule align-top">
                      <td className="py-2 text-[11px] uppercase tracking-wider text-meta pt-3">{l.line_type}</td>
                      <td className="py-2">
                        {l.line_type === "plant" ? (
                          <select
                            disabled={isLocked}
                            value={l.plant_rate_card_id ?? ""}
                            onChange={(e) => {
                              const pick = plantRates.find((p) => p.id === e.target.value);
                              updateLine.mutate({
                                id: l.id,
                                patch: {
                                  plant_rate_card_id: e.target.value || null,
                                  description: pick ? `${pick.size_class} ${pick.type}` : l.description,
                                  client_rate_aud: pick?.wet_hire_nt_hr ?? l.client_rate_aud,
                                },
                              });
                            }}
                            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
                          >
                            <option value="">— pick plant —</option>
                            {plantRates.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.size_class} {p.type} {p.wet_hire_nt_hr ? `· $${p.wet_hire_nt_hr}/hr` : ""}
                              </option>
                            ))}
                          </select>
                        ) : l.line_type === "labour" ? (
                          <select
                            disabled={isLocked}
                            value={l.classification_id ?? ""}
                            onChange={(e) => {
                              const c = classifications.find((x) => x.id === e.target.value);
                              const lr = labourRates.find((r) => r.classification_id === e.target.value);
                              updateLine.mutate({
                                id: l.id,
                                patch: {
                                  classification_id: e.target.value || null,
                                  description: c?.classification ?? l.description,
                                  client_rate_aud: lr?.nt_rate ?? l.client_rate_aud,
                                  cost_rate_aud: Number(c?.nt_cost_per_hr ?? l.cost_rate_aud),
                                },
                              });
                            }}
                            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
                          >
                            <option value="">— pick classification —</option>
                            {classifications.map((c) => (
                              <option key={c.id} value={c.id}>{c.classification} · {c.employment_type}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            disabled={isLocked}
                            defaultValue={l.description}
                            onBlur={(e) => updateLine.mutate({ id: l.id, patch: { description: e.target.value } })}
                            className="border border-rule px-2 py-1.5 bg-white text-xs w-full"
                          />
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="0.25" disabled={isLocked} defaultValue={l.quantity} onBlur={(e) => updateLine.mutate({ id: l.id, patch: { quantity: Number(e.target.value) } })} className="border border-rule px-2 py-1.5 bg-white text-xs w-20 text-right tabular-nums" />
                      </td>
                      <td className="py-2">
                        <select disabled={isLocked} value={l.unit} onChange={(e) => updateLine.mutate({ id: l.id, patch: { unit: e.target.value as Unit } })} className="border border-rule px-2 py-1.5 bg-white text-xs w-20">
                          {(["hr","day","wk","ea","m","m2","m3","t","L"] as Unit[]).map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="0.01" disabled={isLocked} defaultValue={l.client_rate_aud} onBlur={(e) => updateLine.mutate({ id: l.id, patch: { client_rate_aud: Number(e.target.value) } })} className="border border-rule px-2 py-1.5 bg-white text-xs w-28 text-right tabular-nums" />
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="0.01" disabled={isLocked} defaultValue={l.cost_rate_aud} onBlur={(e) => updateLine.mutate({ id: l.id, patch: { cost_rate_aud: Number(e.target.value) } })} className="border border-rule px-2 py-1.5 bg-white text-xs w-28 text-right tabular-nums" />
                      </td>
                      <td className="py-3 text-xs text-right tabular-nums">{aud(rev)}</td>
                      <td className="py-3 text-xs text-right tabular-nums font-semibold" style={{ color: rev - cost >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)" }}>{aud(rev - cost)}</td>
                      <td className="py-2 text-right">
                        {!isLocked && (
                          <button type="button" onClick={() => deleteLine.mutate(l.id)} className="text-meta hover:text-[color:var(--brand)] text-sm px-1">×</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td colSpan={6} className="py-3 text-xs text-right font-semibold text-meta uppercase tracking-wider">Totals</td>
                  <td className="py-3 text-xs text-right tabular-nums font-semibold">{aud(totals.rev)}</td>
                  <td className="py-3 text-xs text-right tabular-nums font-semibold" style={{ color: totals.margin >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)" }}>{aud(totals.margin)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={5} />
                  <td className="py-1 text-[11px] text-right text-meta">Cost {aud(totals.cost)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Status / signing */}
      <section className="border border-rule p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="t-headline">Client docket</h2>
          <span className="text-[11px] uppercase tracking-wider text-meta">Status · {dw.status.replace(/_/g, " ")}</span>
        </div>

        {dw.status === "draft" && (
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => setStatus.mutate({ status: "awaiting_signature", method: "in_app" })} className="text-xs px-3 py-2 bg-[color:var(--brand)] text-white">
              Send for client signature
            </button>
            <span className="text-xs text-meta">or</span>
            <label className="text-xs px-3 py-2 border border-rule cursor-pointer hover:bg-neutral-50">
              Upload signed PDF
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSigned.mutate(f); }} />
            </label>
            <button type="button" onClick={() => setStatus.mutate({ status: "void" })} className="text-xs px-3 py-2 border border-rule text-meta hover:text-[color:var(--brand)] ml-auto">
              Void
            </button>
          </div>
        )}

        {dw.status === "awaiting_signature" && (
          <p className="text-xs text-meta">Signing link generated. Client signing portal lands in the next iteration — for now, upload the signed PDF once returned.</p>
        )}

        {dw.status === "signed" && (
          <div className="text-xs">
            <p className="text-meta">Signed{dw.signed_at ? ` on ${shortDate(dw.signed_at)}` : ""}{dw.signed_by_name ? ` by ${dw.signed_by_name}` : ""}.</p>
            {dw.signed_docket_pdf_url && (
              <a href={dw.signed_docket_pdf_url} target="_blank" rel="noreferrer" className="underline mt-2 inline-block">Download signed docket</a>
            )}
          </div>
        )}

        {dw.status === "void" && <p className="text-xs text-meta">This daywork was voided and does not flow into P&amp;L.</p>}
      </section>

      <button type="button" onClick={() => navigate({ to: "/dayworks" })} className="mt-6 text-xs text-meta hover:text-ink">← Back to dayworks list</button>
    </SiteShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs md:col-span-1">
      <span className="text-meta">{label}</span>
      {children}
    </label>
  );
}
