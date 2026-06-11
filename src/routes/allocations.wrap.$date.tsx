import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, UserX, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/allocations/wrap/$date")({
  head: () => ({ meta: [{ title: "EOD Wrap — PACC HQ" }] }),
  component: WrapPage,
});

const BRAND = "#DC3D3F";
const GREEN = "#22c55e";
const ORANGE = "#f59e0b";

type Planned = {
  id: string;
  allocation_date: string;
  person_id: string;
  job_id: string;
  classification_id: string | null;
  plant_item_id: string | null;
  supervisor_id: string | null;
  planned_hours: number | null;
  employment_type: string | null;
  notes: string | null;
};
type CardState =
  | { kind: "unconfirmed" }
  | { kind: "confirmed" }
  | { kind: "edited"; job_id: string; classification_id: string | null; plant_item_id: string | null; actual_hours: number }
  | { kind: "absent" };

function fmtHeader(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function WrapPage() {
  const { date } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role, personId, isAdmin, isSupervisor, loading: roleLoading } = useRole();
  const [filter, setFilter] = useState<"mine" | "all">("mine");
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  // default filter based on role once known
  useEffect(() => {
    if (roleLoading) return;
    setFilter(isAdmin ? "all" : "mine");
  }, [roleLoading, isAdmin]);

  const plannedQ = useQuery({
    queryKey: ["wrap-planned", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("id, allocation_date, person_id, job_id, classification_id, plant_item_id, supervisor_id, planned_hours, employment_type, notes")
        .eq("allocation_date", date)
        .eq("status", "planned");
      if (error) throw error;
      return (data ?? []) as Planned[];
    },
  });

  const actualsQ = useQuery({
    queryKey: ["wrap-actuals", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("id, planned_allocation_id, actual_hours, notes")
        .eq("allocation_date", date)
        .eq("status", "actual");
      if (error) throw error;
      return data ?? [];
    },
  });

  const crewQ = useQuery({
    queryKey: ["wrap-crew"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crew_members")
        .select("id, name, default_supervisor_id")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectsQ = useQuery({
    queryKey: ["wrap-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, code, name").eq("active", true).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const classQ = useQuery({
    queryKey: ["wrap-classifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classifications").select("id, code, classification").eq("active", true).not("code", "is", null).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const plantQ = useQuery({
    queryKey: ["wrap-plant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plant_items").select("id, plant_id_code").eq("active", true).order("plant_id_code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const crewById = useMemo(() => new Map((crewQ.data ?? []).map((c: any) => [c.id, c])), [crewQ.data]);
  const projById = useMemo(() => new Map((projectsQ.data ?? []).map((p: any) => [p.id, p])), [projectsQ.data]);
  const classById = useMemo(() => new Map((classQ.data ?? []).map((c: any) => [c.id, c])), [classQ.data]);
  const plantById = useMemo(() => new Map((plantQ.data ?? []).map((p: any) => [p.id, p])), [plantQ.data]);

  // Filter to "my crew" or "all"
  const filtered = useMemo(() => {
    const rows = plannedQ.data ?? [];
    if (filter === "all") return rows;
    if (!personId) return [];
    return rows.filter((r) => {
      const c: any = crewById.get(r.person_id);
      return c?.default_supervisor_id === personId;
    });
  }, [plannedQ.data, filter, personId, crewById]);

  // Pre-mark cards that already have a linked actual as "confirmed"
  useEffect(() => {
    if (!actualsQ.data || !plannedQ.data) return;
    setStates((prev) => {
      const next = { ...prev };
      const linked = new Set((actualsQ.data as any[]).map((a) => a.planned_allocation_id).filter(Boolean));
      for (const p of plannedQ.data) {
        if (linked.has(p.id) && !next[p.id]) next[p.id] = { kind: "confirmed" };
      }
      return next;
    });
  }, [actualsQ.data, plannedQ.data]);

  const setState = (id: string, s: CardState) => setStates((prev) => ({ ...prev, [id]: s }));

  const allConfirmed = filtered.length > 0 && filtered.every((p) => {
    const s = states[p.id];
    return s && s.kind !== "unconfirmed";
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!personId && !isAdmin) throw new Error("No person linked to this user.");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      const inserts: any[] = [];
      let variance = 0;
      for (const p of filtered) {
        const s = states[p.id];
        if (!s || s.kind === "unconfirmed") continue;
        // Skip if an actual already exists for this planned row
        const alreadyLinked = (actualsQ.data as any[] | undefined)?.some((a) => a.planned_allocation_id === p.id);
        if (alreadyLinked) continue;

        const base = {
          allocation_date: p.allocation_date,
          person_id: p.person_id,
          supervisor_id: personId,
          status: "actual" as const,
          source: "wrap",
          employment_type: p.employment_type,
          planned_allocation_id: p.id,
          created_by: uid,
        };

        if (s.kind === "confirmed") {
          inserts.push({
            ...base,
            job_id: p.job_id,
            classification_id: p.classification_id,
            plant_item_id: p.plant_item_id,
            actual_hours: p.planned_hours ?? 0,
            notes: p.notes,
          });
        } else if (s.kind === "absent") {
          variance += 1;
          inserts.push({
            ...base,
            job_id: p.job_id,
            classification_id: p.classification_id,
            plant_item_id: p.plant_item_id,
            actual_hours: 0,
            notes: "absent",
          });
        } else {
          variance += 1;
          inserts.push({
            ...base,
            job_id: s.job_id,
            classification_id: s.classification_id,
            plant_item_id: s.plant_item_id,
            actual_hours: s.actual_hours,
            notes: p.notes,
          });
        }
      }

      if (inserts.length) {
        const { error } = await supabase.from("daily_allocations").insert(inserts);
        if (error) throw error;
      }

      // Upsert daily_reports row (one per date+supervisor).
      // Set `complete` atomically with submitted_at/submitted_by so existing
      // downstream filters on `complete = true` see board-driven wraps.
      const reportRow = {
        report_date: date,
        supervisor_id: personId,
        allocation_count: filtered.length,
        variance_count: variance,
        submitted_at: new Date().toISOString(),
        submitted_by: uid,
        complete: true,
      };
      // Try to find existing row
      const { data: existing } = await supabase
        .from("daily_reports")
        .select("id")
        .eq("report_date", date)
        .eq("supervisor_id", personId ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("daily_reports").update(reportRow).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_reports").insert(reportRow);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allocations"] });
      qc.invalidateQueries({ queryKey: ["wrap-actuals", date] });
      toast.success("Wrap submitted");
      navigate({ to: "/allocations" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit wrap"),
  });

  if (roleLoading) {
    return (
      <SiteShell section="Allocations">
        <div className="text-meta text-sm">Loading…</div>
      </SiteShell>
    );
  }

  if (!isAdmin && !isSupervisor) {
    return (
      <SiteShell section="Allocations">
        <p className="text-sm text-meta">You need supervisor or admin role to wrap allocations.</p>
      </SiteShell>
    );
  }

  return (
    <SiteShell section="Allocations">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/allocations"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-semibold text-meta hover:text-ink mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Allocations
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ fontFamily: "Poppins", color: BRAND }}>
            EOD Wrap — {fmtHeader(date)}
          </h1>
          <p className="mt-1 text-sm text-ink" style={{ fontFamily: "Poppins" }}>
            Confirm or correct the day's allocations
          </p>
        </div>
        <div className="flex items-center gap-1 border border-rule rounded-md p-0.5">
          {isAdmin && (
            <button
              onClick={() => setFilter("all")}
              className={`px-3 h-7 text-[10px] uppercase tracking-[0.16em] font-semibold rounded ${filter === "all" ? "bg-neutral-900 text-white" : "text-meta hover:text-ink"}`}
            >
              All
            </button>
          )}
          <button
            onClick={() => setFilter("mine")}
            className={`px-3 h-7 text-[10px] uppercase tracking-[0.16em] font-semibold rounded ${filter === "mine" ? "bg-neutral-900 text-white" : "text-meta hover:text-ink"}`}
          >
            My crew
          </button>
        </div>
      </header>

      <div className="grid gap-2">
        {plannedQ.isLoading && <p className="text-sm text-meta">Loading…</p>}
        {!plannedQ.isLoading && filtered.length === 0 && (
          <p className="text-sm text-meta">No planned allocations for this date{filter === "mine" ? " on your crew" : ""}.</p>
        )}
        {filtered.map((p) => {
          const state = states[p.id] ?? ({ kind: "unconfirmed" } as CardState);
          const crew: any = crewById.get(p.person_id);
          const proj: any = projById.get(p.job_id);
          const cls: any = p.classification_id ? classById.get(p.classification_id) : null;
          const plant: any = p.plant_item_id ? plantById.get(p.plant_item_id) : null;
          const isEditing = editingId === p.id;
          return (
            <Card
              key={p.id}
              state={state}
              isEditing={isEditing}
              crewName={crew?.name ?? "—"}
              projectLabel={proj ? `${proj.code} — ${proj.name}` : "—"}
              classCode={cls?.code ?? cls?.classification ?? ""}
              plantCode={plant?.plant_id_code ?? ""}
              plannedHours={p.planned_hours ?? 0}
              projects={projectsQ.data ?? []}
              classifications={classQ.data ?? []}
              plant={plantQ.data ?? []}
              onConfirm={() => { setState(p.id, { kind: "confirmed" }); setEditingId(null); }}
              onAbsent={() => { setState(p.id, { kind: "absent" }); setEditingId(null); }}
              onStartEdit={() => {
                const init = state.kind === "edited" ? state : {
                  kind: "edited" as const,
                  job_id: p.job_id,
                  classification_id: p.classification_id,
                  plant_item_id: p.plant_item_id,
                  actual_hours: p.planned_hours ?? 0,
                };
                setState(p.id, init);
                setEditingId(p.id);
              }}
              onEditChange={(patch) => {
                const cur = state.kind === "edited" ? state : {
                  kind: "edited" as const,
                  job_id: p.job_id,
                  classification_id: p.classification_id,
                  plant_item_id: p.plant_item_id,
                  actual_hours: p.planned_hours ?? 0,
                };
                setState(p.id, { ...cur, ...patch });
              }}
              onEditDone={() => setEditingId(null)}
            />
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <span className="text-xs text-meta">
          {Object.values(states).filter((s) => s.kind !== "unconfirmed").length} / {filtered.length} ready
        </span>
        <button
          disabled={!allConfirmed || submit.isPending}
          onClick={() => submit.mutate()}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] font-semibold px-4 py-2 rounded text-white disabled:opacity-40"
          style={{ background: GREEN }}
        >
          {submit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Submit Wrap
        </button>
      </div>
    </SiteShell>
  );
}

function Card({
  state, isEditing, crewName, projectLabel, classCode, plantCode, plannedHours,
  projects, classifications, plant,
  onConfirm, onAbsent, onStartEdit, onEditChange, onEditDone,
}: {
  state: CardState; isEditing: boolean;
  crewName: string; projectLabel: string; classCode: string; plantCode: string; plannedHours: number;
  projects: any[]; classifications: any[]; plant: any[];
  onConfirm: () => void; onAbsent: () => void; onStartEdit: () => void;
  onEditChange: (p: Partial<Extract<CardState, { kind: "edited" }>>) => void;
  onEditDone: () => void;
}) {
  const badge = (() => {
    switch (state.kind) {
      case "confirmed": return { label: "Confirmed", color: GREEN };
      case "edited": return { label: "Edited", color: ORANGE };
      case "absent": return { label: "Absent", color: "#737373" };
      default: return { label: "Unconfirmed", color: BRAND };
    }
  })();

  return (
    <div className="border border-rule rounded-md bg-white p-3" style={{ borderLeft: `3px solid ${badge.color}`, fontFamily: "Poppins" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink truncate">{crewName}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded" style={{ color: badge.color, border: `1px solid ${badge.color}` }}>
              {badge.label}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-meta truncate">
            {projectLabel}{classCode ? ` · ${classCode}` : ""}{plantCode ? ` · ${plantCode}` : ""} · {plannedHours}h planned
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-semibold px-2.5 h-7 rounded text-white"
            style={{ background: GREEN }}
            title="Confirm as planned"
          >
            <Check className="h-3 w-3" /> Confirm
          </button>
          <button
            onClick={onStartEdit}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-semibold px-2.5 h-7 rounded border border-rule hover:border-[color:var(--brand)]"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={onAbsent}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-semibold px-2.5 h-7 rounded border border-rule hover:border-neutral-500 text-meta"
          >
            <UserX className="h-3 w-3" /> Absent
          </button>
        </div>
      </div>

      {isEditing && state.kind === "edited" && (
        <div className="mt-3 pt-3 border-t border-rule grid gap-2 md:grid-cols-4">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-meta flex flex-col gap-1">
            Project
            <select
              value={state.job_id}
              onChange={(e) => onEditChange({ job_id: e.target.value })}
              className="border border-rule rounded px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-meta flex flex-col gap-1">
            Classification
            <select
              value={state.classification_id ?? ""}
              onChange={(e) => onEditChange({ classification_id: e.target.value || null })}
              className="border border-rule rounded px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink"
            >
              <option value="">— None —</option>
              {classifications.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.classification}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-meta flex flex-col gap-1">
            Plant
            <select
              value={state.plant_item_id ?? ""}
              onChange={(e) => onEditChange({ plant_item_id: e.target.value || null })}
              className="border border-rule rounded px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink"
            >
              <option value="">— None —</option>
              {plant.map((p) => <option key={p.id} value={p.id}>{p.plant_id_code}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-meta flex flex-col gap-1">
            Actual hours
            <input
              type="number"
              step="0.25"
              value={state.actual_hours}
              onChange={(e) => onEditChange({ actual_hours: Number(e.target.value) })}
              className="border border-rule rounded px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink"
            />
          </label>
          <div className="md:col-span-4 flex justify-end">
            <button onClick={onEditDone} className="text-[10px] uppercase tracking-[0.16em] font-semibold px-3 h-7 rounded border border-rule hover:border-[color:var(--brand)]">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
