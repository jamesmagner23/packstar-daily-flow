import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/use-role";
import { CompetencyFormDialog, type CompetencyRow } from "@/components/crew/CompetencyFormDialog";
import { expiryLabel, expiryTone } from "@/lib/expiry";

export const Route = createFileRoute("/tickets/")({
  head: () => ({ meta: [{ title: "Tickets — PACC HQ" }] }),
  component: TicketsLibraryPage,
});

function TicketsLibraryPage() {
  const { isAdmin, isCrew, loading } = useRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);

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
    queryKey: ["tickets-library"],
    queryFn: async () => {
      const [{ data: comps }, { data: pc }, { data: crew }] = await Promise.all([
        supabase.from("competencies").select("id, code, name, type").order("code"),
        supabase.from("person_competencies").select("person_id, competency_id, expiry_date"),
        supabase.from("crew_members").select("id, active"),
      ]);
      const activeCrew = new Set((crew ?? []).filter((c: any) => c.active !== false).map((c: any) => c.id));
      const holders = new Map<string, Set<string>>();
      const expiring = new Map<string, number>();
      for (const r of pc ?? []) {
        if (!activeCrew.has(r.person_id)) continue;
        if (!holders.has(r.competency_id)) holders.set(r.competency_id, new Set());
        holders.get(r.competency_id)!.add(r.person_id);
        if (r.expiry_date && r.expiry_date >= today && r.expiry_date <= in30) {
          expiring.set(r.competency_id, (expiring.get(r.competency_id) ?? 0) + 1);
        }
      }
      return (comps ?? []).map((c: any) => ({
        ...c,
        holders: holders.get(c.id)?.size ?? 0,
        expiring: expiring.get(c.id) ?? 0,
      }));
    },
  });

  if (drillId) {
    return <DrilldownView competencyId={drillId} onBack={() => setDrillId(null)} />;
  }

  return (
    <SiteShell section="People">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">People / Tickets</div>
          <h1 className="t-display mt-2">Tickets library</h1>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add competency type
          </Button>
        )}
      </header>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Code</th>
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Type</th>
                <th className="py-2 font-semibold text-right">Holders</th>
                <th className="py-2 font-semibold text-right">Expiring 30d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                  onClick={() => setDrillId(r.id)}>
                  <td className="py-3 text-xs font-mono">{r.code}</td>
                  <td className="py-3 text-xs font-semibold">{r.name}</td>
                  <td className="py-3 text-xs"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                  <td className="py-3 text-xs text-right tabular-nums">{r.holders}</td>
                  <td className="py-3 text-xs text-right">
                    {r.expiring > 0 ? (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100">{r.expiring}</Badge>
                    ) : <span className="text-meta">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CompetencyFormDialog open={dialogOpen} onOpenChange={setDialogOpen} competency={null} />
    </SiteShell>
  );
}

function DrilldownView({ competencyId, onBack }: { competencyId: string; onBack: () => void }) {
  const { data: comp } = useQuery({
    queryKey: ["competency", competencyId],
    queryFn: async () => {
      const { data } = await supabase.from("competencies").select("id, code, name, type").eq("id", competencyId).maybeSingle();
      return data as CompetencyRow | null;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["competency-holders", competencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("person_competencies")
        .select("person_id, issued_date, expiry_date, crew_members(id, name, active)")
        .eq("competency_id", competencyId);
      return (data ?? [])
        .filter((r: any) => r.crew_members?.active !== false)
        .map((r: any) => ({
          id: r.crew_members?.id,
          name: r.crew_members?.name,
          issued_date: r.issued_date,
          expiry_date: r.expiry_date,
        }));
    },
  });

  return (
    <SiteShell section="People">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-meta hover:text-ink mb-3">
        <ArrowLeft className="h-3 w-3" /> Back to tickets
      </button>
      <h1 className="t-display">{comp?.name ?? "Loading…"}</h1>
      <p className="text-xs text-meta mt-1">{comp?.code} · {comp?.type}</p>

      <div className="hairline pt-4 mt-6">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-meta py-6">No active crew currently holding this ticket.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Issued</th>
                <th className="py-2 font-semibold">Expiry</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = expiryTone(r.expiry_date);
                const cls = tone === "green"
                  ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                  : tone === "amber"
                  ? "bg-amber-100 text-amber-900 border-amber-200"
                  : "bg-red-100 text-red-900 border-red-200";
                return (
                  <tr key={r.id} className="border-t border-rule">
                    <td className="py-2 text-xs font-semibold">
                      <Link to="/crew/$id" params={{ id: r.id }} className="hover:underline">{r.name}</Link>
                    </td>
                    <td className="py-2 text-xs">{r.issued_date ?? "—"}</td>
                    <td className="py-2 text-xs">{r.expiry_date ?? "No expiry"}</td>
                    <td className="py-2 text-xs"><Badge className={`${cls} text-[10px]`}>{expiryLabel(r.expiry_date)}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SiteShell>
  );
}
