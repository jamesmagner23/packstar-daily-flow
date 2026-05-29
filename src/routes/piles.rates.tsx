import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { aud } from "@/lib/format";
import { useActiveProjectId } from "@/hooks/use-active-project";

export const Route = createFileRoute("/piles/rates")({
  head: () => ({ meta: [{ title: "Labour-hire rates — PACC HQ" }] }),
  component: RatesPage,
});

type NewRow = {
  kind: "labour" | "ute" | "other";
  description: string;
  classification_id: string | null;
  nt_rate: string;
  ot_rate: string;
  day_rate: string;
};

function emptyRow(): NewRow {
  return { kind: "labour", description: "", classification_id: null, nt_rate: "", ot_rate: "", day_rate: "" };
}

function RatesPage() {
  const qc = useQueryClient();
  const activeProjectId = useActiveProjectId();
  const [newRow, setNewRow] = useState<NewRow>(emptyRow());
  const [msg, setMsg] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["rates-project", activeProjectId],
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

  const { data: classifications = [] } = useQuery({
    queryKey: ["classifications-all"],
    queryFn: async () => (await supabase.from("classifications").select("id, classification, employment_type").order("classification")).data ?? [],
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["labour-hire-rates", projectId],
    enabled: !!projectId,
    queryFn: async () => (await supabase.from("labour_hire_rates").select("*, classifications(classification, employment_type)").eq("project_id", projectId!).order("created_at")).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const payload: any = {
        project_id: projectId,
        kind: newRow.kind,
        description: newRow.description || null,
        classification_id: newRow.classification_id || null,
        nt_rate: newRow.nt_rate ? Number(newRow.nt_rate) : null,
        ot_rate: newRow.ot_rate ? Number(newRow.ot_rate) : null,
        day_rate: newRow.day_rate ? Number(newRow.day_rate) : null,
      };
      const { error } = await supabase.from("labour_hire_rates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewRow(emptyRow());
      setMsg("Added.");
      qc.invalidateQueries({ queryKey: ["labour-hire-rates", projectId] });
    },
    onError: (e: any) => setMsg(`Failed: ${e.message ?? e}`),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("labour_hire_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labour-hire-rates", projectId] }),
  });

  return (
    <SiteShell section="Labour-hire rates">
      <header className="mb-10">
        <div className="t-eyebrow">{project?.code ?? "Schedule"}</div>
        <h1 className="t-display mt-2">Labour-hire rates</h1>
        <p className="t-lead mt-3 max-w-2xl">{project?.name ? `${project.name}. ` : ""}The schedule rates the client pays us per hour or per day. Cost stays on the EBA classification — margin is the gap.</p>
      </header>

      <div className="hairline pt-6 mb-10">
        <h2 className="t-stat-label mb-3">Add rate</h2>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
          <Select label="Kind" value={newRow.kind} onChange={(v) => setNewRow((r) => ({ ...r, kind: v as any }))} options={[["labour","Labour"],["ute","Ute"],["other","Other"]]} />
          <Select label="Classification" value={newRow.classification_id ?? ""} onChange={(v) => setNewRow((r) => ({ ...r, classification_id: v || null }))} options={[["","—"], ...classifications.map((c: any) => [c.id, `${c.classification} (${c.employment_type})`] as [string, string])]} />
          <Text label="Description" value={newRow.description} onChange={(v) => setNewRow((r) => ({ ...r, description: v }))} />
          <Text label="NT $/hr" value={newRow.nt_rate} onChange={(v) => setNewRow((r) => ({ ...r, nt_rate: v }))} numeric />
          <Text label="OT $/hr" value={newRow.ot_rate} onChange={(v) => setNewRow((r) => ({ ...r, ot_rate: v }))} numeric />
          <Text label="Day rate" value={newRow.day_rate} onChange={(v) => setNewRow((r) => ({ ...r, day_rate: v }))} numeric />
          <button
            onClick={() => add.mutate()}
            disabled={add.isPending || !projectId}
            className="text-xs uppercase tracking-[0.16em] font-semibold bg-[color:var(--brand)] text-white px-4 py-2 hover:bg-[color:var(--brand-deep)] transition disabled:opacity-50 h-fit"
          >
            {add.isPending ? "…" : "Add"}
          </button>
        </div>
        {msg && <p className="text-xs text-meta mt-2">{msg}</p>}
      </div>

      <div className="hairline pt-6">
        {rates.length === 0 ? (
          <p className="text-xs text-meta py-8">No rates yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Kind</th>
                <th className="py-2 font-semibold">Classification</th>
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 font-semibold">NT</th>
                <th className="py-2 font-semibold">OT</th>
                <th className="py-2 font-semibold">Day</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rates.map((r: any) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-3 uppercase tracking-wider text-meta">{r.kind}</td>
                  <td className="py-3">{r.classifications ? `${r.classifications.classification} (${r.classifications.employment_type})` : "—"}</td>
                  <td className="py-3">{r.description ?? "—"}</td>
                  <td className="py-3 tabular-nums">{r.nt_rate ? aud(r.nt_rate) : "—"}</td>
                  <td className="py-3 tabular-nums">{r.ot_rate ? aud(r.ot_rate) : "—"}</td>
                  <td className="py-3 tabular-nums">{r.day_rate ? aud(r.day_rate) : "—"}</td>
                  <td className="py-3"><button onClick={() => del.mutate(r.id)} className="text-meta hover:text-[color:var(--brand)]">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SiteShell>
  );
}

function Text({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-stat-label">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? "decimal" : undefined}
        className="border border-rule rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[color:var(--brand)]"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-stat-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-rule rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-[color:var(--brand)]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
