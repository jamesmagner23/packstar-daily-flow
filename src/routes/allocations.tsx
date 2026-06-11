import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/allocations")({
  head: () => ({ meta: [{ title: "Allocations — PACC HQ" }] }),
  component: AllocationsPage,
});

const BRAND = "#DC3D3F";
const GREEN = "#22c55e";
const ORANGE = "#f59e0b";

// ---------- date helpers (AU week Mon–Sun) ----------
function startOfWeek(d: Date) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtCol(d: Date) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
}
function fmtRange(start: Date, end: Date) {
  const f = (d: Date) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(d);
  const y = new Intl.DateTimeFormat("en-AU", { year: "numeric" }).format(end);
  return `${f(start)} – ${f(end)} ${y}`;
}

// ---------- types ----------
type Crew = { id: string; name: string; employment_type: string | null; default_supervisor_id: string | null };
type Project = { id: string; code: string; name: string };
type Classification = { id: string; code: string | null; classification: string; description: string | null };
type PlantItem = { id: string; plant_id_code: string; description: string | null };
type Allocation = {
  id: string;
  allocation_date: string;
  person_id: string;
  job_id: string;
  classification_id: string | null;
  plant_item_id: string | null;
  supervisor_id: string | null;
  status: "planned" | "actual";
  source: string;
  employment_type: string | null;
  planned_hours: number | null;
  actual_hours: number | null;
  planned_allocation_id: string | null;
  notes: string | null;
};

function isPast(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  return dd.getTime() < today.getTime();
}

// ---------- page ----------
function AllocationsPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6];
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(weekEnd);

  const { isAdmin, isSupervisor } = useRole();
  const today = isoDate(new Date());

  const [modal, setModal] = useState<
    | { mode: "create"; person_id: string; date: string }
    | { mode: "edit"; allocation: Allocation }
    | null
  >(null);

  const crewQ = useQuery({
    queryKey: ["alloc-crew"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crew_members")
        .select("id, name, employment_type, default_supervisor_id")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Crew[];
    },
  });

  const projectsQ = useQuery({
    queryKey: ["alloc-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, code, name").eq("active", true).order("code");
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const classQ = useQuery({
    queryKey: ["alloc-classifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classifications")
        .select("id, code, classification, description")
        .eq("active", true)
        .not("code", "is", null)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Classification[];
    },
  });

  const plantQ = useQuery({
    queryKey: ["alloc-plant"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plant_items")
        .select("id, plant_id_code, description")
        .eq("active", true)
        .order("plant_id_code");
      if (error) throw error;
      return (data ?? []) as PlantItem[];
    },
  });

  const allocQ = useQuery({
    queryKey: ["allocations", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("id, allocation_date, person_id, job_id, classification_id, plant_item_id, supervisor_id, status, source, employment_type, planned_hours, actual_hours, planned_allocation_id, notes")
        .gte("allocation_date", fromIso)
        .lte("allocation_date", toIso);
      if (error) throw error;
      return (data ?? []) as Allocation[];
    },
  });

  // index allocations by person_id + date
  const grid = useMemo(() => {
    const m = new Map<string, Allocation[]>();
    (allocQ.data ?? []).forEach((a) => {
      const k = `${a.person_id}|${a.allocation_date}`;
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    });
    return m;
  }, [allocQ.data]);

  const projectName = (id: string) => projectsQ.data?.find((p) => p.id === id)?.code ?? "—";
  const classCode = (id: string | null) =>
    !id ? "" : classQ.data?.find((c) => c.id === id)?.code ?? classQ.data?.find((c) => c.id === id)?.classification ?? "";
  const plantCode = (id: string | null) => (!id ? "" : plantQ.data?.find((p) => p.id === id)?.plant_id_code ?? "");

  return (
    <SiteShell section="Allocations">
      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ fontFamily: "Poppins, ui-sans-serif, system-ui", color: BRAND }}>
            Allocations
          </h1>
          <p className="mt-2 text-sm text-ink" style={{ fontFamily: "Poppins, ui-sans-serif, system-ui" }}>
            {fmtRange(weekStart, weekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="h-9 w-9 inline-flex items-center justify-center border border-rule rounded-md hover:border-[color:var(--brand)]"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="h-9 px-3 text-xs uppercase tracking-[0.16em] font-semibold border border-rule rounded-md hover:border-[color:var(--brand)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="h-9 w-9 inline-flex items-center justify-center border border-rule rounded-md hover:border-[color:var(--brand)]"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {(isAdmin || isSupervisor) && (
            <Link
              to="/allocations/wrap/$date"
              params={{ date: today }}
              className="h-9 px-3 inline-flex items-center text-xs uppercase tracking-[0.16em] font-semibold rounded-md text-white"
              style={{ background: GREEN }}
            >
              {isAdmin ? "Wrap Today" : "Wrap My Crew"}
            </Link>
          )}
        </div>
      </header>

      <div className="border border-rule rounded-md bg-white overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ fontFamily: "Poppins, ui-sans-serif, system-ui" }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-50 text-left px-3 py-2 border-b border-r border-rule font-semibold text-meta uppercase tracking-wider min-w-[160px]">
                Crew
              </th>
              {weekDays.map((d) => (
                <th key={isoDate(d)} className="text-left px-3 py-2 border-b border-rule font-semibold text-meta uppercase tracking-wider min-w-[200px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>{fmtCol(d)}</span>
                    {(isAdmin || isSupervisor) && (
                      <Link
                        to="/allocations/wrap/$date"
                        params={{ date: isoDate(d) }}
                        className="text-[10px] normal-case tracking-normal font-semibold text-meta hover:text-[color:var(--brand)]"
                      >
                        Wrap
                      </Link>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crewQ.isLoading && (
              <tr><td className="px-3 py-6 text-meta" colSpan={8}>Loading…</td></tr>
            )}
            {crewQ.data?.length === 0 && (
              <tr><td className="px-3 py-6 text-meta" colSpan={8}>No active crew members.</td></tr>
            )}
            {crewQ.data?.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-r border-rule align-top font-medium text-ink">
                  {c.name}
                </td>
                {weekDays.map((d) => {
                  const k = `${c.id}|${isoDate(d)}`;
                  const items = grid.get(k) ?? [];
                  const planned = items.filter((a) => a.status === "planned");
                  const actuals = items.filter((a) => a.status === "actual");
                  const actualByPlanned = new Map(actuals.filter((a) => a.planned_allocation_id).map((a) => [a.planned_allocation_id!, a]));
                  const orphanActuals = actuals.filter((a) => !a.planned_allocation_id);
                  const past = isPast(d);

                  const renderMini = (a: Allocation, kind: "planned" | "actual") => (
                    <button
                      key={`${kind}-${a.id}`}
                      type="button"
                      onClick={() => setModal({ mode: "edit", allocation: a })}
                      className="flex-1 min-w-0 text-left bg-white border border-rule rounded px-1.5 py-1 hover:shadow-sm transition"
                      style={{ borderLeft: `3px solid ${kind === "actual" ? GREEN : BRAND}` }}
                    >
                      <div className="font-semibold text-ink truncate text-[11px]" style={{ fontFamily: "Poppins" }}>
                        {projectName(a.job_id)}
                      </div>
                      <div className="text-[9px] text-meta truncate">
                        {classCode(a.classification_id)}
                        {a.plant_item_id ? ` · ${plantCode(a.plant_item_id)}` : ""}
                        {" · "}
                        {kind === "actual" ? `${a.actual_hours ?? 0}h` : `${a.planned_hours ?? 0}h`}
                      </div>
                    </button>
                  );

                  const diffs = (p: Allocation, a: Allocation) =>
                    p.job_id !== a.job_id ||
                    p.classification_id !== a.classification_id ||
                    p.plant_item_id !== a.plant_item_id ||
                    (p.planned_hours ?? 0) !== (a.actual_hours ?? 0);

                  return (
                    <td key={k} className="px-2 py-2 border-b border-rule align-top">
                      <div className="flex flex-col gap-1.5 min-h-[64px]">
                        {planned.map((p) => {
                          const a = actualByPlanned.get(p.id);
                          if (a) {
                            const variance = diffs(p, a);
                            return (
                              <div key={p.id} className="flex items-stretch gap-1">
                                {renderMini(p, "planned")}
                                {variance && (
                                  <span
                                    title="Variance"
                                    className="self-center w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: ORANGE }}
                                  />
                                )}
                                {renderMini(a, "actual")}
                              </div>
                            );
                          }
                          return (
                            <div key={p.id} className="flex flex-col gap-0.5">
                              {renderMini(p, "planned")}
                              {past && (
                                <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded self-start" style={{ color: BRAND, border: `1px solid ${BRAND}` }}>
                                  Not wrapped
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {orphanActuals.map((a) => renderMini(a, "actual"))}
                        <button
                          type="button"
                          onClick={() => setModal({ mode: "create", person_id: c.id, date: isoDate(d) })}
                          className="group border border-dashed border-neutral-300 hover:border-[color:var(--brand)] rounded h-7 inline-flex items-center justify-center text-neutral-300 hover:text-[color:var(--brand)] transition"
                          aria-label="Add allocation"
                        >
                          <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <AllocationModal
          modal={modal}
          crew={crewQ.data ?? []}
          projects={projectsQ.data ?? []}
          classifications={classQ.data ?? []}
          plant={plantQ.data ?? []}
          onClose={() => setModal(null)}
        />
      )}
    </SiteShell>
  );
}

// ---------- modal ----------
function AllocationModal({
  modal,
  crew,
  projects,
  classifications,
  plant,
  onClose,
}: {
  modal:
    | { mode: "create"; person_id: string; date: string }
    | { mode: "edit"; allocation: Allocation };
  crew: Crew[];
  projects: Project[];
  classifications: Classification[];
  plant: PlantItem[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = modal.mode === "edit";
  const person = crew.find((c) =>
    isEdit ? c.id === modal.allocation.person_id : c.id === modal.person_id,
  );
  const date = isEdit ? modal.allocation.allocation_date : modal.date;

  const [jobId, setJobId] = useState<string>(isEdit ? modal.allocation.job_id : projects[0]?.id ?? "");
  const [classificationId, setClassificationId] = useState<string>(
    isEdit ? modal.allocation.classification_id ?? "" : "",
  );
  const [plantItemId, setPlantItemId] = useState<string>(isEdit ? modal.allocation.plant_item_id ?? "" : "");
  const [employmentType, setEmploymentType] = useState<string>(
    isEdit
      ? modal.allocation.employment_type ?? person?.employment_type ?? "employee"
      : person?.employment_type ?? "employee",
  );
  const [plannedHours, setPlannedHours] = useState<string>(
    isEdit ? String(modal.allocation.planned_hours ?? 10) : "10",
  );
  const [notes, setNotes] = useState<string>(isEdit ? modal.allocation.notes ?? "" : "");
  const [err, setErr] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("Pick a project.");
      const { data: userRes } = await supabase.auth.getUser();
      const created_by = userRes.user?.id ?? null;
      const payload = {
        allocation_date: date,
        person_id: isEdit ? modal.allocation.person_id : modal.person_id,
        job_id: jobId,
        classification_id: classificationId || null,
        plant_item_id: plantItemId || null,
        employment_type: employmentType,
        planned_hours: plannedHours ? Number(plannedHours) : null,
        notes: notes || null,
        source: isEdit ? modal.allocation.source : "board",
        status: isEdit ? modal.allocation.status : "planned",
        ...(isEdit ? {} : { created_by }),
      };
      if (isEdit) {
        const { error } = await supabase.from("daily_allocations").update(payload).eq("id", modal.allocation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_allocations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allocations"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!isEdit) return;
      const { error } = await supabase.from("daily_allocations").delete().eq("id", modal.allocation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allocations"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message ?? String(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: "Poppins, ui-sans-serif, system-ui" }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md border border-rule">
        <div className="px-5 py-4 border-b border-rule flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: BRAND }}>
              {isEdit ? "Edit allocation" : "Add allocation"}
            </h2>
            <p className="text-xs text-meta mt-0.5">{person?.name ?? "—"} · {date}</p>
          </div>
          <button onClick={onClose} className="text-meta hover:text-ink text-sm">✕</button>
        </div>

        <div className="px-5 py-4 grid gap-3">
          <Field label="Project">
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="select-base">
              <option value="">— Select —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="Classification">
            <select value={classificationId} onChange={(e) => setClassificationId(e.target.value)} className="select-base">
              <option value="">— None —</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>{c.code ?? c.classification}{c.description ? ` — ${c.description}` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Plant (optional)">
            <select value={plantItemId} onChange={(e) => setPlantItemId(e.target.value)} className="select-base">
              <option value="">— None —</option>
              {plant.map((p) => <option key={p.id} value={p.id}>{p.plant_id_code}{p.description ? ` — ${p.description}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Employment type">
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="select-base">
              <option value="employee">Employee</option>
              <option value="casual">Casual</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </Field>
          <Field label="Planned hours">
            <input
              type="number"
              step="0.25"
              value={plannedHours}
              onChange={(e) => setPlannedHours(e.target.value)}
              className="select-base"
            />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="select-base" />
          </Field>
          {err && <p className="text-xs" style={{ color: BRAND }}>{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-rule flex items-center justify-between">
          {isEdit ? (
            <button
              onClick={() => del.mutate()}
              disabled={del.isPending}
              className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.16em] font-semibold text-meta hover:text-[color:var(--brand)] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs uppercase tracking-[0.16em] font-semibold px-3 py-2 border border-rule rounded hover:border-neutral-400">
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="text-xs uppercase tracking-[0.16em] font-semibold px-4 py-2 rounded text-white disabled:opacity-50"
              style={{ background: GREEN }}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .select-base {
          width: 100%;
          border: 1px solid var(--rule, #e5e5e5);
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 12px;
          background: white;
          font-family: Poppins, ui-sans-serif, system-ui;
        }
        .select-base:focus { outline: none; border-color: ${BRAND}; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-meta">{label}</span>
      {children}
    </label>
  );
}
