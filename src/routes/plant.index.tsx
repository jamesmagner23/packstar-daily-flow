import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/use-role";
import { useActiveProjectId } from "@/hooks/use-active-project";

export const Route = createFileRoute("/plant/")({
  head: () => ({ meta: [{ title: "Plant — PACC HQ" }] }),
  component: PlantListPage,
});

type PlantRow = {
  id: string;
  plant_id_code: string;
  description: string | null;
  tonnage_class: string | null;
  active: boolean | null;
};

type Row = PlantRow & {
  current_operator: string | null;
  last_service: string | null;
  prestart_tone: "green" | "red" | "grey";
  prestart_label: string;
};

function PlantListPage() {
  const { isCrew, loading: roleLoading } = useRole();
  const projectId = useActiveProjectId();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  if (!roleLoading && isCrew) {
    return (
      <SiteShell section="Plant">
        <div className="max-w-md mt-12">
          <h1 className="t-headline">Web UI not available for crew yet</h1>
          <p className="t-body mt-2 text-meta">Please use Slack DM.</p>
        </div>
      </SiteShell>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["plant-list", projectId, today],
    queryFn: async () => {
      let q = supabase
        .from("plant_items")
        .select("id, plant_id_code, description, tonnage_class, active")
        .order("plant_id_code");
      if (projectId) q = q.eq("project_id", projectId);
      const { data: plant } = await q;
      const items = (plant ?? []) as PlantRow[];
      if (items.length === 0) return [] as Row[];

      const ids = items.map((p) => p.id);

      const [{ data: allocs }, { data: prestarts }, { data: services }, { data: crew }] = await Promise.all([
        supabase
          .from("daily_allocations")
          .select("person_id, plant_asset_ids, allocation_date")
          .eq("allocation_date", today)
          .overlaps("plant_asset_ids", ids),
        supabase
          .from("plant_prestart_logs")
          .select("asset_id, completed_at, operator_person_id")
          .in("asset_id", ids)
          .eq("prestart_date", today),
        supabase
          .from("plant_service_logs")
          .select("asset_id, service_date")
          .in("asset_id", ids)
          .order("service_date", { ascending: false }),
        supabase.from("crew_members").select("id, name"),
      ]);

      const crewById = new Map((crew ?? []).map((c: any) => [c.id, c.name as string]));
      const allocByAsset = new Map<string, string>();
      for (const a of allocs ?? []) {
        for (const aid of (a.plant_asset_ids ?? []) as string[]) {
          if (ids.includes(aid)) allocByAsset.set(aid, a.person_id);
        }
      }
      const prestartByAsset = new Map((prestarts ?? []).map((p: any) => [p.asset_id, p]));
      const lastService = new Map<string, string>();
      for (const s of services ?? []) {
        if (!lastService.has(s.asset_id)) lastService.set(s.asset_id, s.service_date);
      }

      return items.map((p) => {
        const allocated = allocByAsset.has(p.id);
        const done = prestartByAsset.has(p.id);
        let tone: Row["prestart_tone"] = "grey";
        let label = "Not allocated";
        if (allocated && done) {
          tone = "green";
          label = "Done";
        } else if (allocated && !done) {
          tone = "red";
          label = "Outstanding";
        }
        const opId = allocByAsset.get(p.id);
        return {
          ...p,
          current_operator: opId ? crewById.get(opId) ?? null : null,
          last_service: lastService.get(p.id) ?? null,
          prestart_tone: tone,
          prestart_label: label,
        } as Row;
      });
    },
  });

  const classes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.tonnage_class && s.add(r.tonnage_class));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (!showInactive && r.active === false) return false;
    if (classFilter && r.tonnage_class !== classFilter) return false;
    if (search && !`${r.plant_id_code} ${r.description ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <SiteShell section="Plant">
      <h1 className="t-headline mb-4">Plant register</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Input
          placeholder="Search asset code or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="h-9 px-2 border border-rule rounded-md text-sm bg-white"
        >
          <option value="">All sizes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-meta">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {isLoading ? (
        <p className="text-xs text-meta py-6">Loading…</p>
      ) : (
        <div className="border border-rule rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-meta">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-left px-3 py-2 font-medium">Size</th>
                <th className="text-left px-3 py-2 font-medium">Operator today</th>
                <th className="text-left px-3 py-2 font-medium">Last service</th>
                <th className="text-left px-3 py-2 font-medium">Pre-start</th>
                <th className="text-left px-3 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-rule hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link to="/plant/$id" params={{ id: r.id }} className="text-[color:var(--brand)] hover:underline font-medium">
                      {r.plant_id_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.description ?? "—"}</td>
                  <td className="px-3 py-2 text-meta">{r.tonnage_class ?? "—"}</td>
                  <td className="px-3 py-2">{r.current_operator ?? <span className="text-meta">—</span>}</td>
                  <td className="px-3 py-2 text-meta">{r.last_service ?? "—"}</td>
                  <td className="px-3 py-2">
                    <PrestartDot tone={r.prestart_tone} label={r.prestart_label} />
                  </td>
                  <td className="px-3 py-2">
                    {r.active === false ? <Badge variant="secondary">Inactive</Badge> : <span className="text-xs text-meta">Yes</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-meta text-xs">No plant items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </SiteShell>
  );
}

function PrestartDot({ tone, label }: { tone: "green" | "red" | "grey"; label: string }) {
  const cls =
    tone === "green" ? "bg-emerald-500" :
    tone === "red" ? "bg-rose-500" : "bg-neutral-300";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className={tone === "grey" ? "text-meta" : ""}>{label}</span>
    </span>
  );
}
