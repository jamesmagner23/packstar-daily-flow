import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/procure/")({
  head: () => ({ meta: [{ title: "Procure — PACC HQ" }] }),
  component: ProcurePage,
});

function ProcurePage() {
  const { data: supplierCount = 0 } = useQuery({
    queryKey: ["suppliers-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: equipCount = 0 } = useQuery({
    queryKey: ["equipment-catalogue-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("equipment_catalogue")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  return (
    <SiteShell section="Procure">
      <header className="mb-10">
        <div className="t-eyebrow">Operations</div>
        <h1 className="t-display mt-2">Procure</h1>
        <p className="t-lead mt-3">Suppliers and equipment catalogue.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          to="/procure/suppliers"
          className="hairline p-6 hover:bg-neutral-50 transition-colors"
        >
          <div className="t-eyebrow">Directory</div>
          <h2 className="t-headline mt-2">Suppliers</h2>
          <p className="t-stat-value mt-4">{supplierCount}</p>
          <p className="t-stat-label mt-1">records</p>
        </Link>

        <Link
          to="/procure/equipment"
          className="hairline p-6 hover:bg-neutral-50 transition-colors"
        >
          <div className="t-eyebrow">Reference</div>
          <h2 className="t-headline mt-2">Equipment Catalogue</h2>
          <p className="t-stat-value mt-4">{equipCount}</p>
          <p className="t-stat-label mt-1">items</p>
        </Link>
      </div>
    </SiteShell>
  );
}
