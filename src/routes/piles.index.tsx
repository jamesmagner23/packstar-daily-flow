import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { useActiveProjectId } from "@/hooks/use-active-project";
import { parsePileSchedule, savePileSchedule } from "@/lib/piling.functions";

export const Route = createFileRoute("/piles/")({
  head: () => ({ meta: [{ title: "Pile schedule — PACC HQ" }] }),
  component: PilesPage,
});

type DraftRow = {
  pile_ref: string;
  sheet_ref: string | null;
  diameter_mm: number | null;
  design_depth_m: number | null;
  design_volume_m3: number | null;
  notes: string | null;
};

function PilesPage() {
  const qc = useQueryClient();
  const activeProjectId = useActiveProjectId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parseFn = useServerFn(parsePileSchedule);
  const saveFn = useServerFn(savePileSchedule);

  const { data: project } = useQuery({
    queryKey: ["piles-project", activeProjectId],
    queryFn: async () => {
      if (activeProjectId) {
        const { data } = await supabase.from("projects").select("id, code, name, project_type, pile_schedule_url").eq("id", activeProjectId).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.from("projects").select("id, code, name, project_type, pile_schedule_url").eq("active", true).order("code").limit(1).maybeSingle();
      return data;
    },
  });

  const projectId = project?.id as string | undefined;

  const { data: piles = [] } = useQuery({
    queryKey: ["pile-schedule", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pile_schedule")
        .select("*")
        .eq("project_id", projectId!)
        .order("pile_ref");
      return data ?? [];
    },
  });

  const upload = async (file: File) => {
    if (!projectId) return;
    setBusy(true);
    setMsg("Uploading…");
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("pile-schedules").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      setUploadedPath(path);
      setMsg("Parsing with AI… this can take 20–40s.");
      const result = await parseFn({ data: { project_id: projectId, storage_path: path } });
      setDraft(result.rows);
      setMsg(`Found ${result.count} piles. Review and save.`);
    } catch (e: any) {
      setMsg(`Failed: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!projectId || !draft) return;
      return saveFn({
        data: {
          project_id: projectId,
          rows: draft.map((d) => ({
            pile_ref: d.pile_ref,
            sheet_ref: d.sheet_ref || null,
            diameter_mm: d.diameter_mm,
            design_depth_m: d.design_depth_m,
            design_volume_m3: d.design_volume_m3,
            notes: d.notes,
          })),
          pile_schedule_url: uploadedPath,
        },
      });
    },
    onSuccess: () => {
      setMsg("Saved.");
      setDraft(null);
      setUploadedPath(null);
      qc.invalidateQueries({ queryKey: ["pile-schedule", projectId] });
    },
    onError: (e: any) => setMsg(`Save failed: ${e.message ?? e}`),
  });

  const drilled = piles.filter((p: any) => p.status !== "pending").length;
  const total = piles.length;
  const pct = total ? Math.round((drilled / total) * 100) : 0;

  return (
    <SiteShell section="Piles">
      <header className="mb-10 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="t-eyebrow">{project?.code ?? "Schedule"}</div>
          <h1 className="t-display mt-2">Pile schedule</h1>
          <p className="t-lead mt-3">{project?.name ? `${project.name}. ` : ""}Upload the engineer's pile schedule PDF. AI extracts each pile so the crew can tick them off via Slack.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !projectId}
            className="text-xs uppercase tracking-[0.16em] font-semibold bg-[color:var(--brand)] text-white px-4 py-2 hover:bg-[color:var(--brand-deep)] transition disabled:opacity-50"
          >
            {busy ? "Working…" : "Upload pile schedule"}
          </button>
          {msg && <p className="text-xs text-meta max-w-xs text-right">{msg}</p>}
        </div>
      </header>

      {project && project.project_type !== "piling_labour" && (
        <p className="text-xs text-meta mb-6">This is a drainage project. The pile schedule is only used on piling labour-hire projects — switch project type in Setup.</p>
      )}

      {total > 0 && !draft && (
        <div className="hairline pt-6 mb-8 grid grid-cols-3 gap-6">
          <Stat label="Total piles" value={String(total)} />
          <Stat label="Drilled / poured" value={String(drilled)} />
          <Stat label="Progress" value={`${pct}%`} />
        </div>
      )}

      {draft ? (
        <div className="hairline pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="t-stat-label">Review extracted piles ({draft.length})</h2>
            <div className="flex gap-3">
              <button onClick={() => { setDraft(null); setUploadedPath(null); setMsg(null); }} className="t-eyebrow text-meta hover:text-ink">Cancel</button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="text-xs uppercase tracking-[0.16em] font-semibold bg-[color:var(--brand)] text-white px-4 py-2 hover:bg-[color:var(--brand-deep)] transition disabled:opacity-50"
              >
                {saveMut.isPending ? "Saving…" : `Replace schedule with ${draft.length} piles`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="t-stat-label">
                  <th className="py-2 font-semibold">Ref</th>
                  <th className="py-2 font-semibold">Sheet</th>
                  <th className="py-2 font-semibold">Ø mm</th>
                  <th className="py-2 font-semibold">Depth m</th>
                  <th className="py-2 font-semibold">Vol m³</th>
                  <th className="py-2 font-semibold">Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.map((r, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td><EditCell v={r.pile_ref} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, pile_ref: v } : x))} /></td>
                    <td><EditCell v={r.sheet_ref ?? ""} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, sheet_ref: v || null } : x))} /></td>
                    <td><EditCell v={r.diameter_mm?.toString() ?? ""} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, diameter_mm: v ? Number(v) : null } : x))} /></td>
                    <td><EditCell v={r.design_depth_m?.toString() ?? ""} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, design_depth_m: v ? Number(v) : null } : x))} /></td>
                    <td><EditCell v={r.design_volume_m3?.toString() ?? ""} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, design_volume_m3: v ? Number(v) : null } : x))} /></td>
                    <td><EditCell v={r.notes ?? ""} onChange={(v) => setDraft((d) => d!.map((x, j) => j === i ? { ...x, notes: v || null } : x))} /></td>
                    <td><button className="text-meta hover:text-[color:var(--brand)]" onClick={() => setDraft((d) => d!.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="hairline pt-6">
          {piles.length === 0 ? (
            <p className="text-xs text-meta py-8">No pile schedule yet. Upload a PDF above.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="t-stat-label">
                  <th className="py-2 font-semibold">Ref</th>
                  <th className="py-2 font-semibold">Sheet</th>
                  <th className="py-2 font-semibold">Ø mm</th>
                  <th className="py-2 font-semibold">Depth m</th>
                  <th className="py-2 font-semibold">Vol m³</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {piles.map((p: any) => (
                  <tr key={p.id} className="border-t border-rule">
                    <td className="py-3 font-mono">{p.pile_ref}</td>
                    <td className="py-3">{p.sheet_ref ?? "—"}</td>
                    <td className="py-3">{p.diameter_mm ?? "—"}</td>
                    <td className="py-3">{p.design_depth_m ?? "—"}</td>
                    <td className="py-3">{p.design_volume_m3 ?? "—"}</td>
                    <td className="py-3 uppercase tracking-wider text-meta">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </SiteShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-stat-label">{label}</div>
      <div className="text-2xl mt-2 tabular-nums">{value}</div>
    </div>
  );
}

function EditCell({ v, onChange }: { v: string; onChange: (v: string) => void }) {
  return (
    <input
      value={v}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent border-0 border-b border-transparent focus:border-[color:var(--brand)] focus:outline-none py-2 text-xs"
    />
  );
}
