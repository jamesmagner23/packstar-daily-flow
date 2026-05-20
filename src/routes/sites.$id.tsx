import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRole } from "@/hooks/use-role";
import { SiteFormDialog, type SiteRow } from "@/components/sites/SiteFormDialog";
import {
  InductionFormDialog, inductionTone, toneClass, type InductionRow,
} from "@/components/sites/InductionFormDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/sites/$id")({
  head: () => ({ meta: [{ title: "Site — PACC HQ" }] }),
  component: SiteDetailPage,
});

function SiteDetailPage() {
  const { id } = Route.useParams();
  const { isAdmin, isCrew, loading } = useRole();
  const [editOpen, setEditOpen] = useState(false);

  if (!loading && isCrew) {
    return (
      <SiteShell section="People">
        <div className="max-w-md mt-12">
          <h1 className="t-headline">Web UI not available for crew yet</h1>
        </div>
      </SiteShell>
    );
  }

  const { data: site } = useQuery({
    queryKey: ["site-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sites")
        .select("id, name, head_contractor, head_contractor_contact, induction_lead_time_days, induction_platform, induction_url, job_id, active")
        .eq("id", id).maybeSingle();
      return data as SiteRow | null;
    },
  });

  if (!site) {
    return (
      <SiteShell section="People">
        <p className="text-xs text-meta py-6">Loading…</p>
      </SiteShell>
    );
  }

  return (
    <SiteShell section="People">
      <div className="mb-2 t-eyebrow">
        <Link to="/sites" className="hover:text-ink">Sites</Link> / Detail
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="t-display">{site.name}</h1>
          <p className="text-sm text-meta mt-1">
            {site.head_contractor ?? "—"} · contact {site.head_contractor_contact ?? "—"} · lead {site.induction_lead_time_days ?? "—"}d
          </p>
          {(site.induction_platform || site.induction_url) && (
            <p className="text-sm text-meta mt-1 flex items-center gap-2 flex-wrap">
              <span>Induction: {site.induction_platform ?? "—"}</span>
              {site.induction_url && (
                <a
                  href={site.induction_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ink hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              )}
            </p>
          )}
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
        )}
      </div>

      <Tabs defaultValue="requirements">
        <TabsList>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="crew">Crew status</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="requirements" className="mt-4">
          <RequirementsTab siteId={id} canEdit={isAdmin} />
        </TabsContent>
        <TabsContent value="crew" className="mt-4">
          <CrewStatusTab siteId={id} canEdit={isAdmin} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab canEdit={isAdmin} />
        </TabsContent>
      </Tabs>

      <SiteFormDialog open={editOpen} onOpenChange={setEditOpen} site={site} />
    </SiteShell>
  );
}

function RequirementsTab({ siteId, canEdit }: { siteId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newComp, setNewComp] = useState("");
  const [newInd, setNewInd] = useState(true);

  const { data: reqs = [] } = useQuery({
    queryKey: ["site-requirements", siteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_requirements")
        .select("id, induction_required, competency_id, competencies(code, name, type)")
        .eq("site_id", siteId);
      return (data ?? []) as any[];
    },
  });

  const { data: comps = [] } = useQuery({
    queryKey: ["competencies-all"],
    queryFn: async () => {
      const { data } = await supabase.from("competencies").select("id, code, name").order("code");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!newComp) throw new Error("Pick a competency");
      const { error } = await supabase
        .from("site_requirements")
        .insert({ site_id: siteId, competency_id: newComp, induction_required: newInd });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-requirements", siteId] });
      setNewComp(""); setNewInd(true); setAdding(false);
      toast.success("Requirement added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => {
      const { error } = await supabase.from("site_requirements").update({ induction_required: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site-requirements", siteId] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-requirements", siteId] });
      toast.success("Removed");
    },
  });

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3 w-3 mr-1" /> Add requirement
          </Button>
        </div>
      )}
      {adding && canEdit && (
        <div className="border border-rule rounded-md p-3 mb-3 flex flex-wrap gap-2 items-end bg-white">
          <select
            className="border border-rule rounded-md px-2 py-1.5 text-sm bg-white"
            value={newComp} onChange={(e) => setNewComp(e.target.value)}
          >
            <option value="">Competency…</option>
            {(comps as any[]).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={newInd} onChange={(e) => setNewInd(e.target.checked)} /> Induction required
          </label>
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Add</Button>
        </div>
      )}
      {reqs.length === 0 ? (
        <p className="text-xs text-meta py-3">No requirements set.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="t-stat-label">
              <th className="py-2 font-semibold">Competency</th>
              <th className="py-2 font-semibold">Type</th>
              <th className="py-2 font-semibold">Induction required</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {reqs.map((r: any) => (
              <tr key={r.id} className="border-t border-rule">
                <td className="py-3 text-xs">{r.competencies?.code} — {r.competencies?.name}</td>
                <td className="py-3 text-xs">{r.competencies?.type ?? "—"}</td>
                <td className="py-3 text-xs">
                  <input
                    type="checkbox"
                    checked={!!r.induction_required}
                    disabled={!canEdit}
                    onChange={(e) => toggle.mutate({ id: r.id, v: e.target.checked })}
                  />
                </td>
                {canEdit && (
                  <td className="py-3 text-xs text-right">
                    <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:underline">
                      <Trash2 className="h-3 w-3 inline" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CrewStatusTab({ siteId, canEdit }: { siteId: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ personId: string; induction: InductionRow | null } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["site-crew-status", siteId],
    queryFn: async () => {
      const [{ data: crew }, { data: pis }] = await Promise.all([
        supabase.from("crew_members").select("id, name, role").eq("active", true).order("name"),
        supabase
          .from("person_inductions")
          .select("id, person_id, site_id, status, booked_for_date, completed_date, expires_date, evidence_url")
          .eq("site_id", siteId),
      ]);
      const piMap = new Map((pis ?? []).map((p: any) => [p.person_id, p]));
      return (crew ?? []).map((c: any) => ({
        ...c,
        induction: piMap.get(c.id) ?? null,
      }));
    },
  });

  const sorted = useMemo(() => {
    const order = { red: 0, amber: 1, grey: 2, green: 3 } as const;
    return [...rows].sort((a: any, b: any) => {
      const ta = a.induction ? inductionTone(a.induction).tone : "grey";
      const tb = b.induction ? inductionTone(b.induction).tone : "grey";
      return (order as any)[ta] - (order as any)[tb];
    });
  }, [rows]);

  if (isLoading) return <p className="text-xs text-meta">Loading…</p>;

  return (
    <div>
      <table className="w-full text-left">
        <thead>
          <tr className="t-stat-label">
            <th className="py-2 font-semibold">Crew</th>
            <th className="py-2 font-semibold">Role</th>
            <th className="py-2 font-semibold">Induction</th>
            <th className="py-2 font-semibold">Key date</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r: any) => {
            const t = r.induction ? inductionTone(r.induction) : { tone: "red" as const, label: "Not booked" };
            const keyDate = r.induction?.completed_date ?? r.induction?.booked_for_date ?? "—";
            return (
              <tr key={r.id} className="border-t border-rule hover:bg-neutral-50">
                <td className="py-3 text-xs font-semibold">
                  <Link to="/crew/$id" params={{ id: r.id }} className="hover:underline">{r.name}</Link>
                </td>
                <td className="py-3 text-xs">{r.role ?? "—"}</td>
                <td className="py-3 text-xs">
                  <button
                    className="inline-block"
                    disabled={!canEdit}
                    onClick={() => setEditing({ personId: r.id, induction: r.induction })}
                  >
                    <Badge className={`${toneClass(t.tone)} text-[10px] cursor-pointer`}>{t.label}</Badge>
                  </button>
                </td>
                <td className="py-3 text-xs">{keyDate}</td>
                {canEdit && (
                  <td className="py-3 text-xs text-right">
                    <button onClick={() => setEditing({ personId: r.id, induction: r.induction })} className="hover:underline">
                      <Pencil className="h-3 w-3 inline" /> Edit
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <InductionFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        personId={editing?.personId ?? ""}
        siteId={siteId}
        induction={editing?.induction ?? null}
      />
    </div>
  );
}

function TasksTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [task, setTask] = useState("");
  const [comp, setComp] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["task-requirements-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_requirements")
        .select("id, task_type, competency_id, competencies(code, name)")
        .order("task_type");
      return (data ?? []) as any[];
    },
  });

  const { data: comps = [] } = useQuery({
    queryKey: ["competencies-all"],
    queryFn: async () => {
      const { data } = await supabase.from("competencies").select("id, code, name").order("code");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!task || !comp) throw new Error("Task type and competency required");
      const { error } = await supabase.from("task_requirements").insert({ task_type: task, competency_id: comp });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-requirements-all"] });
      setTask(""); setComp(""); setAdding(false);
      toast.success("Added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-requirements-all"] }),
  });

  return (
    <div>
      <p className="text-xs text-meta mb-3">Task requirements apply system-wide, not per-site.</p>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setAdding((a) => !a)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
      )}
      {adding && canEdit && (
        <div className="border border-rule rounded-md p-3 mb-3 flex flex-wrap gap-2 items-end bg-white">
          <input
            className="border border-rule rounded-md px-2 py-1.5 text-sm bg-white"
            placeholder="task type e.g. excavator_operation"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <select
            className="border border-rule rounded-md px-2 py-1.5 text-sm bg-white"
            value={comp} onChange={(e) => setComp(e.target.value)}
          >
            <option value="">Competency…</option>
            {(comps as any[]).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Add</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-meta py-3">No task requirements set.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="t-stat-label">
              <th className="py-2 font-semibold">Task type</th>
              <th className="py-2 font-semibold">Required competency</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-rule">
                <td className="py-3 text-xs">{r.task_type}</td>
                <td className="py-3 text-xs">{r.competencies?.code} — {r.competencies?.name}</td>
                {canEdit && (
                  <td className="py-3 text-xs text-right">
                    <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:underline">
                      <Trash2 className="h-3 w-3 inline" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
