import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { useActiveProjectId } from "@/hooks/use-active-project";
import { createDaywork } from "@/lib/dayworks.functions";
import { aud, shortDate } from "@/lib/format";

export const Route = createFileRoute("/dayworks/")({
  head: () => ({
    meta: [
      { title: "Dayworks — PACC HQ" },
      { name: "description", content: "Daywork dockets — plant, labour, and materials billed separately to lump-sum contract." },
    ],
  }),
  component: DayworksList,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_signature: "Awaiting signature",
  signed: "Signed",
  void: "Void",
};

function DayworksList() {
  const projectId = useActiveProjectId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createDaywork);
  const [showNew, setShowNew] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["dayworks-project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data } = await supabase.from("projects").select("id, code, name, project_type").eq("id", projectId).maybeSingle();
      return data;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["dayworks-list", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dayworks")
        .select("id, reference, work_date, description, status, client_contact_name, daywork_lines(revenue_aud, cost_aud)")
        .eq("project_id", projectId!)
        .order("work_date", { ascending: false });
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (vars: { work_date: string; description: string }) => {
      if (!projectId) throw new Error("Pick a project first");
      return createFn({
        data: {
          project_id: projectId,
          work_date: vars.work_date,
          description: vars.description || null,
        },
      });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["dayworks-list", projectId] });
      setShowNew(false);
      navigate({ to: "/dayworks/$id", params: { id: created.id } });
    },
  });

  return (
    <SiteShell section="Dayworks">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <div className="t-eyebrow">{project?.code ?? "Project"}</div>
          <h1 className="t-display mt-2">Dayworks &amp; variations</h1>
          <p className="t-lead mt-3 max-w-2xl">
            {project?.name ? `${project.name}. ` : ""}Plant, labour and materials billed outside the lump-sum contract. Each entry generates a docket for client sign-off and flows into the project P&amp;L as a separate revenue stream.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          disabled={!projectId}
          className="inline-flex items-center px-3 py-2 bg-[color:var(--brand)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
        >
          + New daywork
        </button>
      </header>

      {showNew && (
        <NewDayworkForm
          onCancel={() => setShowNew(false)}
          onSubmit={(v) => createMut.mutate(v)}
          submitting={createMut.isPending}
          error={createMut.error?.message}
        />
      )}

      <div className="hairline pt-6">
        {rows.length === 0 ? (
          <p className="text-xs text-meta py-8">No dayworks recorded yet for this project.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Ref</th>
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 font-semibold text-right">Revenue</th>
                <th className="py-2 font-semibold text-right">Cost</th>
                <th className="py-2 font-semibold text-right">Margin</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lines = (r.daywork_lines ?? []) as { revenue_aud: number | null; cost_aud: number | null }[];
                const rev = lines.reduce((a, l) => a + Number(l.revenue_aud ?? 0), 0);
                const cost = lines.reduce((a, l) => a + Number(l.cost_aud ?? 0), 0);
                const margin = rev - cost;
                return (
                  <tr key={r.id} className="border-t border-rule hover:bg-[color:var(--accent)] cursor-pointer" onClick={() => navigate({ to: "/dayworks/$id", params: { id: r.id } })}>
                    <td className="py-3 text-xs font-mono font-semibold">{r.reference}</td>
                    <td className="py-3 text-xs">{shortDate(r.work_date)}</td>
                    <td className="py-3 text-xs">{r.description ?? "—"}</td>
                    <td className="py-3 text-xs text-right tabular-nums">{aud(rev)}</td>
                    <td className="py-3 text-xs text-right tabular-nums">{aud(cost)}</td>
                    <td className="py-3 text-xs text-right tabular-nums font-semibold" style={{ color: margin >= 0 ? "oklch(0.55 0.15 160)" : "var(--brand)" }}>{aud(margin)}</td>
                    <td className="py-3 text-[11px] uppercase tracking-wider text-meta">{STATUS_LABEL[r.status] ?? r.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-meta mt-6">
        Need to edit rates? <Link to="/piles/rates" className="underline">Open rate card</Link>.
      </p>
    </SiteShell>
  );
}

function NewDayworkForm({
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  onCancel: () => void;
  onSubmit: (v: { work_date: string; description: string }) => void;
  submitting: boolean;
  error?: string;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ work_date: date, description: desc });
      }}
      className="border border-rule p-4 mb-6 bg-neutral-50 grid grid-cols-1 md:grid-cols-[160px_1fr_auto_auto] gap-3 items-end"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-meta">Work date (backfill OK)</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="border border-rule px-2 py-1.5 bg-white" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-meta">Brief description</span>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 20t excavator + spotter, Lot 14 spoil cart" className="border border-rule px-2 py-1.5 bg-white" />
      </label>
      <button type="submit" disabled={submitting} className="px-3 py-2 bg-[color:var(--brand)] text-white text-xs font-semibold disabled:opacity-50">
        {submitting ? "Creating…" : "Create draft"}
      </button>
      <button type="button" onClick={onCancel} className="px-3 py-2 border border-rule text-xs text-meta hover:text-ink">Cancel</button>
      {error && <p className="col-span-full text-xs text-[color:var(--brand)]">{error}</p>}
    </form>
  );
}
