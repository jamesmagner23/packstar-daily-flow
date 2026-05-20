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
import { SiteFormDialog, type SiteRow } from "@/components/sites/SiteFormDialog";

export const Route = createFileRoute("/sites/")({
  head: () => ({ meta: [{ title: "Sites — PACC HQ" }] }),
  component: SitesListPage,
});

function SitesListPage() {
  const navigate = useNavigate();
  const { isAdmin, isCrew, loading } = useRole();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!loading && isCrew) {
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
    queryKey: ["sites-list"],
    queryFn: async () => {
      const { data: sites } = await supabase
        .from("sites")
        .select("id, name, head_contractor, head_contractor_contact, induction_lead_time_days, induction_platform, induction_url, job_id, active")
        .order("name");
      const list = (sites ?? []) as SiteRow[];
      if (list.length === 0) return [];

      const ids = list.map((s) => s.id);
      const [{ data: pis }, { data: projs }] = await Promise.all([
        supabase.from("person_inductions").select("site_id, status, expires_date").in("site_id", ids),
        supabase
          .from("projects")
          .select("id, active")
          .in("id", list.map((s) => s.job_id).filter(Boolean) as string[]),
      ]);

      const projActive = new Map((projs ?? []).map((p: any) => [p.id, p.active !== false]));
      const inducted = new Map<string, number>();
      const expiring = new Map<string, number>();
      for (const r of pis ?? []) {
        if (r.status === "completed") {
          inducted.set(r.site_id, (inducted.get(r.site_id) ?? 0) + 1);
          if (r.expires_date && r.expires_date >= today && r.expires_date <= in30) {
            expiring.set(r.site_id, (expiring.get(r.site_id) ?? 0) + 1);
          }
        }
      }

      return list.map((s) => ({
        ...s,
        project_active: s.job_id ? projActive.get(s.job_id) === true : false,
        inducted_count: inducted.get(s.id) ?? 0,
        expiring_count: expiring.get(s.id) ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (!showInactive && r.active === false) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, showInactive]);

  return (
    <SiteShell section="People">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">People / Sites</div>
          <h1 className="t-display mt-2">Sites</h1>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add site
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Input placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-meta">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-meta py-6">No sites match.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Site</th>
                <th className="py-2 font-semibold">Head contractor</th>
                <th className="py-2 font-semibold text-right">Lead (d)</th>
                <th className="py-2 font-semibold">Project</th>
                <th className="py-2 font-semibold text-right">Inducted</th>
                <th className="py-2 font-semibold">Expiring 30d</th>
                <th className="py-2 font-semibold">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                  onClick={() => navigate({ to: "/sites/$id", params: { id: r.id } })}>
                  <td className="py-3 text-xs font-semibold">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to="/sites/$id" params={{ id: r.id }} className="hover:underline">{r.name}</Link>
                      {r.induction_platform && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {r.induction_platform}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-xs">{r.head_contractor ?? "—"}</td>
                  <td className="py-3 text-xs text-right tabular-nums">{r.induction_lead_time_days ?? "—"}</td>
                  <td className="py-3 text-xs">{r.project_active ? "Active" : <span className="text-meta">—</span>}</td>
                  <td className="py-3 text-xs text-right tabular-nums">{r.inducted_count}</td>
                  <td className="py-3 text-xs">
                    {r.expiring_count > 0
                      ? <Badge className="bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100">{r.expiring_count}</Badge>
                      : <span className="text-meta">—</span>}
                  </td>
                  <td className="py-3 text-xs">{r.active === false ? "No" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SiteFormDialog open={dialogOpen} onOpenChange={setDialogOpen} site={null} />
    </SiteShell>
  );
}
