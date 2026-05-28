import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { shortDate, businessDaysRemaining } from "@/lib/format";
import { useActiveProjectId } from "@/hooks/use-active-project";

export const Route = createFileRoute("/variations/")({
  head: () => ({
    meta: [
      { title: "Variations register — PACC HQ" },
      { name: "description", content: "Open and closed variation flags with clause references and notice deadlines." },
    ],
  }),
  component: VariationsPage,
});

function VariationsPage() {
  const activeProjectId = useActiveProjectId();

  const { data: project } = useQuery({
    queryKey: ["variations-project", activeProjectId],
    queryFn: async () => {
      if (activeProjectId) {
        const { data } = await supabase.from("projects").select("id, code, name").eq("id", activeProjectId).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.from("projects").select("id, code, name").eq("active", true).order("code").limit(1).maybeSingle();
      return data;
    },
  });

  const projectId = project?.id as string | undefined;

  const { data = [] } = useQuery({
    queryKey: ["variations-all", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <SiteShell section="Variations">
      <header className="mb-10">
        <div className="t-eyebrow">{project?.code ?? "Register"}</div>
        <h1 className="t-display mt-2">Variation flags</h1>
        <p className="t-lead mt-3 max-w-2xl">
          {project?.name ? `${project.name}. ` : ""}Every flag raised by the daily wrap. Clause references, notice deadlines, and current status.
        </p>
      </header>

      <div className="hairline pt-6">
        {data.length === 0 ? (
          <p className="text-xs text-meta py-8">Nothing flagged yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Type</th>
                <th className="py-2 font-semibold">Clause</th>
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 font-semibold">Deadline</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => {
                const bd = businessDaysRemaining(v.deadline_at);
                const urgent = bd !== null && bd < 1 && v.status !== "closed";
                return (
                  <tr key={v.id} className="border-t border-rule">
                    <td className="py-3 text-xs">{shortDate(v.created_at)}</td>
                    <td className="py-3 text-xs">{v.claim_type}</td>
                    <td className="py-3 text-xs font-mono">{v.clause_ref}</td>
                    <td className="py-3 text-xs max-w-md">
                      <Link to="/variations/$id" params={{ id: v.id }} className="hover:text-[color:var(--brand)]">
                        {v.description ?? v.trigger_phrase ?? "—"}
                      </Link>
                    </td>
                    <td className={`py-3 text-xs ${urgent ? "text-[color:var(--brand)] font-semibold" : ""}`}>
                      {bd === null ? "—" : bd < 0 ? `${Math.abs(bd)} BD overdue` : `${bd} BD`}
                    </td>
                    <td className="py-3 text-xs uppercase tracking-wider text-meta">{v.status}</td>
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
