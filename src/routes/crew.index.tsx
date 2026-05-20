import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/use-role";
import { useActiveProjectId } from "@/hooks/use-active-project";
import { CrewFormDialog, type CrewRow } from "@/components/crew/CrewFormDialog";

export const Route = createFileRoute("/crew/")({
  head: () => ({ meta: [{ title: "Crew — PACC HQ" }] }),
  component: CrewListPage,
});

type IndTone = "green" | "amber" | "red" | "grey";

type Row = CrewRow & {
  supervisor_name: string | null;
  active_tickets: number;
  expiring_30d: number;
  induction_tone: IndTone;
  induction_label: string;
};

function CrewListPage() {
  const navigate = useNavigate();
  const { role, isCrew, isAdmin, loading: roleLoading } = useRole();
  const projectId = useActiveProjectId();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [empFilter, setEmpFilter] = useState("");
  const [supFilter, setSupFilter] = useState(""); // "" all, "__none__" unassigned, or supervisor id
  const [dialogOpen, setDialogOpen] = useState(false);

  // Crew-role guard
  if (!roleLoading && isCrew) {
    return (
      <SiteShell section="People">
        <div className="max-w-md mt-12">
          <h1 className="t-headline">Web UI not available for crew yet</h1>
          <p className="t-body mt-2 text-meta">Please use Slack DM.</p>
        </div>
      </SiteShell>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crew-list", projectId, role],
    enabled: !roleLoading,
    queryFn: async () => {
      let q = supabase
        .from("crew_members")
        .select("id, name, role, employment_type, phone, email, slack_user_id, project_id, default_supervisor_id, active")
        .order("name");
      if (projectId && !isAdmin) q = q.eq("project_id", projectId);
      else if (projectId) q = q.eq("project_id", projectId);
      const { data: crew } = await q;
      const list = (crew ?? []) as CrewRow[];
      if (list.length === 0) return [] as Row[];

      const ids = list.map((c) => c.id);
      const supIds = Array.from(new Set(list.map((c) => c.default_supervisor_id).filter(Boolean))) as string[];

      const [{ data: pcAll }, { data: pcExp }, { data: inductions }, { data: sups }] = await Promise.all([
        supabase
          .from("person_competencies")
          .select("person_id, expiry_date")
          .in("person_id", ids),
        supabase
          .from("person_competencies")
          .select("person_id, expiry_date")
          .in("person_id", ids)
          .not("expiry_date", "is", null)
          .gte("expiry_date", today)
          .lte("expiry_date", in30),
        supabase
          .from("person_inductions")
          .select("person_id, status, expires_date")
          .in("person_id", ids),
        supIds.length
          ? supabase.from("supervisors").select("id, name").in("id", supIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const activeByPerson = new Map<string, number>();
      for (const r of pcAll ?? []) {
        if (r.expiry_date === null || r.expiry_date >= today) {
          activeByPerson.set(r.person_id, (activeByPerson.get(r.person_id) ?? 0) + 1);
        }
      }
      const expByPerson = new Map<string, number>();
      for (const r of pcExp ?? []) {
        expByPerson.set(r.person_id, (expByPerson.get(r.person_id) ?? 0) + 1);
      }
      const supName = new Map<string, string>((sups ?? []).map((s: any) => [s.id, s.name]));

      // Roll up induction status per person: worst of all their inductions.
      // grey = none on file, red = any not_booked/expired/expiring within 7d,
      // amber = any booked or expiring within 30d, green = all current.
      const indByPerson = new Map<string, IndTone>();
      const indLabel = new Map<string, string>();
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      for (const r of (inductions ?? []) as any[]) {
        const prev = indByPerson.get(r.person_id);
        let next: IndTone = "grey";
        let label = r.status as string;
        if (r.status === "not_booked" || r.status === "expired") {
          next = "red"; label = r.status === "expired" ? "Expired" : "Not booked";
        } else if (r.status === "booked") {
          next = "amber"; label = "Booked";
        } else if (r.status === "completed") {
          if (r.expires_date && r.expires_date < today) { next = "red"; label = "Expired"; }
          else if (r.expires_date && r.expires_date <= in7) { next = "red"; label = "Expiring <7d"; }
          else if (r.expires_date && r.expires_date <= in30) { next = "amber"; label = "Expiring 30d"; }
          else { next = "green"; label = "Current"; }
        }
        const rank: Record<IndTone, number> = { red: 3, amber: 2, green: 1, grey: 0 };
        if (!prev || rank[next] > rank[prev]) {
          indByPerson.set(r.person_id, next);
          indLabel.set(r.person_id, label);
        }
      }

      return list.map<Row>((c) => ({
        ...c,
        supervisor_name: c.default_supervisor_id ? (supName.get(c.default_supervisor_id) ?? null) : null,
        active_tickets: activeByPerson.get(c.id) ?? 0,
        expiring_30d: expByPerson.get(c.id) ?? 0,
        induction_tone: indByPerson.get(c.id) ?? "grey",
        induction_label: indLabel.get(c.id) ?? "—",
      }));
    },
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisors-active", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("supervisors").select("id, name")
        .eq("project_id", projectId!).eq("active", true).order("name");
      return data ?? [];
    },
  });

  const employmentTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.employment_type).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && r.active === false) return false;
      if (empFilter && r.employment_type !== empFilter) return false;
      if (supFilter === "__none__" && r.default_supervisor_id) return false;
      if (supFilter && supFilter !== "__none__" && r.default_supervisor_id !== supFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, showInactive, empFilter, supFilter]);

  return (
    <SiteShell section="People">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">People / Crew</div>
          <h1 className="t-display mt-2">Crew</h1>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add crew member
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Input placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="border border-rule rounded-md px-3 py-2 text-sm bg-white"
          value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="">All employment types</option>
          {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="border border-rule rounded-md px-3 py-2 text-sm bg-white"
          value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
          <option value="">All supervisors</option>
          <option value="__none__">Unassigned</option>
          {supervisors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-meta">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-meta py-6">No crew members match these filters.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Employment</th>
                <th className="py-2 font-semibold">Default supervisor</th>
                <th className="py-2 font-semibold text-right">Active tickets</th>
                <th className="py-2 font-semibold">Expiring 30d</th>
                <th className="py-2 font-semibold">Induction</th>
                <th className="py-2 font-semibold">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                  onClick={() => navigate({ to: "/crew/$id", params: { id: r.id } })}>
                  <td className="py-3 text-xs font-semibold">
                    <Link to="/crew/$id" params={{ id: r.id }} className="hover:underline">{r.name}</Link>
                  </td>
                  <td className="py-3 text-xs">{r.employment_type ?? "—"}</td>
                  <td className="py-3 text-xs">{r.supervisor_name ?? <span className="text-meta">Unassigned</span>}</td>
                  <td className="py-3 text-xs text-right tabular-nums">{r.active_tickets}</td>
                  <td className="py-3 text-xs">
                    {r.expiring_30d > 0 ? (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100">
                        {r.expiring_30d}
                      </Badge>
                    ) : <span className="text-meta">—</span>}
                  </td>
                  <td className="py-3 text-xs">{r.active === false ? "No" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CrewFormDialog open={dialogOpen} onOpenChange={setDialogOpen} crew={null} defaultProjectId={projectId} />
    </SiteShell>
  );
}
