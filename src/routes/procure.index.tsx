import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { SupplierFormDialog } from "@/components/procure/SupplierFormDialog";
import { EquipmentFormDialog } from "@/components/procure/EquipmentFormDialog";

export const Route = createFileRoute("/procure/")({
  head: () => ({ meta: [{ title: "Procure — PACC HQ" }] }),
  component: ProcurePage,
});

function ProcurePage() {
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);

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

  const { data: newQuoteCount = 0 } = useQuery({
    queryKey: ["procure-quotes-new-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("procure_quotes")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count ?? 0;
    },
  });
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
        <div className="hairline p-6 relative hover:bg-neutral-50 transition-colors">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSupplierOpen(true); }}
            className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full border border-rule text-meta hover:text-ink hover:bg-white"
            aria-label="Add supplier"
            title="Add supplier"
          >
            <Plus className="h-4 w-4" />
          </button>
          <Link to="/procure/suppliers" className="block">
            <div className="t-eyebrow">Directory</div>
            <h2 className="t-headline mt-2">Suppliers</h2>
            <p className="t-stat-value mt-4">{supplierCount}</p>
            <p className="t-stat-label mt-1">records</p>
          </Link>
        </div>

        <div className="hairline p-6 relative hover:bg-neutral-50 transition-colors">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEquipOpen(true); }}
            className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full border border-rule text-meta hover:text-ink hover:bg-white"
            aria-label="Add equipment"
            title="Add equipment"
          >
            <Plus className="h-4 w-4" />
          </button>
          <Link to="/procure/equipment" className="block">
            <div className="t-eyebrow">Reference</div>
            <h2 className="t-headline mt-2">Equipment Catalogue</h2>
            <p className="t-stat-value mt-4">{equipCount}</p>
            <p className="t-stat-label mt-1">items</p>
          </Link>
        </div>
      </div>

      <SupplierFormDialog open={supplierOpen} onOpenChange={setSupplierOpen} supplier={null} />
      <EquipmentFormDialog open={equipOpen} onOpenChange={setEquipOpen} item={null} />
    </SiteShell>
  );
}
