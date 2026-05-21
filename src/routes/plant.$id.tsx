import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/use-role";
import { toast } from "sonner";

export const Route = createFileRoute("/plant/$id")({
  head: () => ({ meta: [{ title: "Asset — PACC HQ" }] }),
  component: PlantDetailPage,
});

type ChecklistItem = { id: string; label: string; type: "pass_fail" | "number" | "text" };

function PlantDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isCrew, isAdmin, loading: roleLoading } = useRole();
  const today = new Date().toISOString().slice(0, 10);

  if (!roleLoading && isCrew) {
    return (
      <SiteShell section="Plant">
        <div className="max-w-md mt-12">
          <h1 className="t-headline">Web UI not available for crew yet</h1>
        </div>
      </SiteShell>
    );
  }

  const { data: asset } = useQuery({
    queryKey: ["plant-asset", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_items")
        .select("id, plant_id_code, description, tonnage_class, rate_basis, daily_rate, weekly_rate, active")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: todayAlloc } = useQuery({
    queryKey: ["plant-alloc-today", id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_allocations")
        .select("person_id")
        .eq("allocation_date", today)
        .overlaps("plant_asset_ids", [id]);
      const personId = data?.[0]?.person_id;
      if (!personId) return null;
      const { data: c } = await supabase.from("crew_members").select("id, name").eq("id", personId).maybeSingle();
      return c;
    },
  });

  const { data: todayLog } = useQuery({
    queryKey: ["plant-prestart-today", id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_prestart_logs")
        .select("*, crew_members:operator_person_id(name)")
        .eq("asset_id", id)
        .eq("prestart_date", today)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ["plant-prestart-recent", id],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("plant_prestart_logs")
        .select("*, crew_members:operator_person_id(name)")
        .eq("asset_id", id)
        .gte("prestart_date", since)
        .order("prestart_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["plant-services", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_service_logs")
        .select("*")
        .eq("asset_id", id)
        .order("service_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: allocHistory = [] } = useQuery({
    queryKey: ["plant-alloc-history", id],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_allocations")
        .select("allocation_date, actual_hours, planned_hours, person_id, job_id")
        .overlaps("plant_asset_ids", [id])
        .gte("allocation_date", since)
        .order("allocation_date", { ascending: false });
      const rows = (data ?? []) as any[];
      const personIds = Array.from(new Set(rows.map((r) => r.person_id)));
      const jobIds = Array.from(new Set(rows.map((r) => r.job_id).filter(Boolean)));
      const [{ data: crew }, { data: projects }] = await Promise.all([
        personIds.length ? supabase.from("crew_members").select("id, name").in("id", personIds) : { data: [] as any[] },
        jobIds.length ? supabase.from("projects").select("id, code, name").in("id", jobIds) : { data: [] as any[] },
      ]);
      const cMap = new Map((crew ?? []).map((c: any) => [c.id, c.name]));
      const pMap = new Map((projects ?? []).map((p: any) => [p.id, `${p.code} — ${p.name}`]));
      return rows.map((r) => ({
        ...r,
        operator: cMap.get(r.person_id) ?? "—",
        job: pMap.get(r.job_id) ?? "—",
      }));
    },
  });

  if (!asset) {
    return (
      <SiteShell section="Plant">
        <p className="text-xs text-meta py-6">Loading…</p>
      </SiteShell>
    );
  }

  return (
    <SiteShell section="Plant">
      <div className="mb-2 t-eyebrow">
        <Link to="/plant" className="hover:text-ink">Plant</Link> / {asset.plant_id_code}
      </div>

      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="w-32 h-32 rounded-md bg-neutral-100 border border-rule flex items-center justify-center text-meta text-xs">
          Photo
        </div>
        <div className="flex-1">
          <h1 className="t-headline">{asset.plant_id_code}</h1>
          <p className="text-meta">{asset.description ?? "—"}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {asset.tonnage_class && <Badge variant="secondary">{asset.tonnage_class}</Badge>}
            <Badge variant={asset.active === false ? "secondary" : "default"}>
              {asset.active === false ? "Inactive" : "Active"}
            </Badge>
            {todayAlloc && <Badge variant="outline">Operator today: {(todayAlloc as any).name}</Badge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="prestart">
        <TabsList>
          <TabsTrigger value="prestart">Pre-start</TabsTrigger>
          <TabsTrigger value="service">Service history</TabsTrigger>
          <TabsTrigger value="ra">Risk assessment</TabsTrigger>
          <TabsTrigger value="alloc">Allocation history</TabsTrigger>
        </TabsList>

        <TabsContent value="prestart" className="space-y-6 mt-4">
          <PrestartTodayBanner log={todayLog} alloc={todayAlloc as any} />
          <PrestartTemplateEditor assetId={id} isAdmin={isAdmin} />
          <PrestartLogList logs={recentLogs} />
        </TabsContent>

        <TabsContent value="service" className="mt-4">
          <ServiceHistory assetId={id} services={services} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="ra" className="mt-4">
          <p className="text-sm text-meta">Risk assessment upload — coming next iteration. Use the existing evidence pattern from tickets.</p>
        </TabsContent>

        <TabsContent value="alloc" className="mt-4">
          <div className="border border-rule rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-meta">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Operator</th>
                  <th className="text-left px-3 py-2 font-medium">Job</th>
                  <th className="text-left px-3 py-2 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {allocHistory.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="px-3 py-2">{r.allocation_date}</td>
                    <td className="px-3 py-2">{r.operator}</td>
                    <td className="px-3 py-2 text-meta">{r.job}</td>
                    <td className="px-3 py-2">{r.actual_hours ?? r.planned_hours ?? "—"}</td>
                  </tr>
                ))}
                {allocHistory.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-6 text-meta text-xs">No allocations in the last 90 days.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </SiteShell>
  );
}

function PrestartTodayBanner({ log, alloc }: { log: any; alloc: { name: string } | null }) {
  if (log) {
    const time = log.completed_at ? new Date(log.completed_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "";
    return (
      <div className="border border-emerald-300 bg-emerald-50 rounded-md p-3">
        <p className="text-sm font-medium text-emerald-900">Pre-start logged today</p>
        <p className="text-xs text-emerald-800 mt-1">
          {log.crew_members?.name ?? "Operator"} at {time}
          {log.issues_raised ? ` — issues: ${log.issues_raised}` : ""}
        </p>
      </div>
    );
  }
  if (alloc) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded-md p-3">
        <p className="text-sm font-medium text-amber-900">Pre-start outstanding</p>
        <p className="text-xs text-amber-800 mt-1">Allocated to {alloc.name}</p>
      </div>
    );
  }
  return (
    <div className="border border-rule rounded-md p-3 text-xs text-meta">
      Not allocated today.
    </div>
  );
}

function PrestartTemplateEditor({ assetId, isAdmin }: { assetId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: template } = useQuery({
    queryKey: ["plant-template", assetId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_prestart_templates")
        .select("id, checklist_items")
        .eq("asset_id", assetId)
        .maybeSingle();
      return data as { id: string; checklist_items: ChecklistItem[] } | null;
    },
  });

  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const current = items ?? (template?.checklist_items as ChecklistItem[] | undefined) ?? [];

  const save = useMutation({
    mutationFn: async (next: ChecklistItem[]) => {
      const { error } = await supabase
        .from("plant_prestart_templates")
        .upsert(
          { asset_id: assetId, checklist_items: next as any, updated_at: new Date().toISOString() },
          { onConflict: "asset_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plant-template", assetId] });
      setItems(null);
      toast.success("Template saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  function update(i: number, patch: Partial<ChecklistItem>) {
    setItems(current.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    setItems(current.filter((_, idx) => idx !== i));
  }
  function add() {
    const next = [...current, { id: `item_${Date.now()}`, label: "New item", type: "pass_fail" as const }];
    setItems(next);
  }

  return (
    <div className="border border-rule rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="t-eyebrow">Pre-start checklist</h3>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={add}><Plus className="h-3 w-3 mr-1" />Add item</Button>
            {items && <Button size="sm" onClick={() => save.mutate(items)} disabled={save.isPending}>Save</Button>}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {current.map((c, i) => (
          <div key={c.id + i} className="flex gap-2 items-center">
            <Input
              value={c.label}
              onChange={(e) => update(i, { label: e.target.value })}
              disabled={!isAdmin}
              className="flex-1"
            />
            <select
              value={c.type}
              onChange={(e) => update(i, { type: e.target.value as ChecklistItem["type"] })}
              disabled={!isAdmin}
              className="h-9 px-2 border border-rule rounded-md text-sm bg-white"
            >
              <option value="pass_fail">Pass/fail</option>
              <option value="number">Number</option>
              <option value="text">Text</option>
            </select>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => remove(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        {current.length === 0 && <p className="text-xs text-meta">No template configured.</p>}
      </div>
    </div>
  );
}

function PrestartLogList({ logs }: { logs: any[] }) {
  return (
    <div>
      <h3 className="t-eyebrow mb-2">Last 30 days</h3>
      <div className="border border-rule rounded-md divide-y divide-rule">
        {logs.map((l) => {
          const responses = (l.checklist_responses ?? {}) as Record<string, any>;
          const fails = Object.entries(responses).filter(([, v]) => v === false || v === "fail").length;
          return (
            <div key={l.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{l.prestart_date}</span>
                  <span className="text-meta ml-2">{l.crew_members?.name ?? "—"}</span>
                </div>
                <Badge variant={fails > 0 || l.issues_raised ? "destructive" : "default"}>
                  {fails > 0 || l.issues_raised ? "Issues" : "Pass"}
                </Badge>
              </div>
              {l.issues_raised && <p className="text-xs text-meta mt-1">{l.issues_raised}</p>}
              {l.photo_url && (
                <a href={l.photo_url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--brand)] hover:underline">
                  View photo
                </a>
              )}
            </div>
          );
        })}
        {logs.length === 0 && <p className="text-xs text-meta p-3">No pre-starts logged in the last 30 days.</p>}
      </div>
    </div>
  );
}

function ServiceHistory({ assetId, services, isAdmin }: { assetId: string; services: any[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ service_date: new Date().toISOString().slice(0, 10), service_type: "", hours_at_service: "", notes: "" });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("plant_service_logs").insert({
        asset_id: assetId,
        service_date: form.service_date,
        service_type: form.service_type || null,
        hours_at_service: form.hours_at_service ? Number(form.hours_at_service) : null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plant-services", assetId] });
      setAdding(false);
      setForm({ service_date: new Date().toISOString().slice(0, 10), service_type: "", hours_at_service: "", notes: "" });
      toast.success("Service logged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div>
      {isAdmin && (
        <div className="mb-3">
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3 w-3 mr-1" />Add service</Button>
          ) : (
            <div className="border border-rule rounded-md p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
                <Input placeholder="Type (e.g. 250hr)" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
                <Input placeholder="Hours at service" value={form.hours_at_service} onChange={(e) => setForm({ ...form, hours_at_service: e.target.value })} />
              </div>
              <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="border border-rule rounded-md divide-y divide-rule">
        {services.map((s) => (
          <div key={s.id} className="p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{s.service_date}</span>
              <span className="text-meta">{s.service_type ?? "—"}</span>
            </div>
            {s.hours_at_service != null && <p className="text-xs text-meta">Hours: {s.hours_at_service}</p>}
            {s.notes && <p className="text-xs mt-1">{s.notes}</p>}
          </div>
        ))}
        {services.length === 0 && <p className="text-xs text-meta p-3">No service history.</p>}
      </div>
    </div>
  );
}
