import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import { EquipmentFormDialog, type EquipmentRow } from "@/components/procure/EquipmentFormDialog";

export const Route = createFileRoute("/procure/equipment")({
  head: () => ({ meta: [{ title: "Equipment Catalogue — PACC HQ" }] }),
  component: EquipmentPage,
});

function EquipmentPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentRow | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["equipment-catalogue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment_catalogue")
        .select("id, category, item_name, typical_specs, rate_basis, notes, active")
        .order("category")
        .order("item_name");
      return (data ?? []) as EquipmentRow[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, EquipmentRow[]>();
    for (const i of items) {
      const arr = m.get(i.category) ?? [];
      arr.push(i);
      m.set(i.category, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(item: EquipmentRow) {
    setEditing(item);
    setDialogOpen(true);
  }

  return (
    <SiteShell section="Procure">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">
            <Link to="/procure" className="hover:text-ink">Procure</Link> / Equipment Catalogue
          </div>
          <h1 className="t-display mt-2">Equipment Catalogue</h1>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Equipment
        </Button>
      </header>

      {isLoading ? (
        <p className="text-xs text-meta py-6">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-meta py-6">No equipment yet.</p>
      ) : (
        <div className="space-y-10">
          {grouped.map(([category, rows]) => (
            <section key={category}>
              <div className="t-eyebrow mb-3">{category}</div>
              <div className="hairline pt-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="t-stat-label">
                      <th className="py-2 font-semibold w-1/4">Item Name</th>
                      <th className="py-2 font-semibold">Typical Specs</th>
                      <th className="py-2 font-semibold w-28">Rate Basis</th>
                      <th className="py-2 font-semibold w-20">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr
                        key={i.id}
                        className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                        onClick={() => openEdit(i)}
                      >
                        <td className="py-3 text-xs font-semibold">{i.item_name}</td>
                        <td className="py-3 text-xs">{i.typical_specs ?? "—"}</td>
                        <td className="py-3 text-xs">{i.rate_basis}</td>
                        <td className="py-3 text-xs">{i.active ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <EquipmentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} />
    </SiteShell>
  );
}
