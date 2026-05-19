import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Input } from "@/components/ui/input";

type Equipment = {
  id: string;
  category: string;
  item_name: string;
  typical_specs: string | null;
  rate_basis: string;
  active: boolean;
};

export const Route = createFileRoute("/procure/equipment")({
  head: () => ({ meta: [{ title: "Equipment Catalogue — PACC HQ" }] }),
  component: EquipmentPage,
});

function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["equipment-catalogue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment_catalogue")
        .select("id, category, item_name, typical_specs, rate_basis, active")
        .order("category")
        .order("item_name");
      return (data ?? []) as Equipment[];
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.item_name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.typical_specs ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, category]);

  return (
    <SiteShell section="Procure">
      <header className="mb-6">
        <div className="t-eyebrow">
          <Link to="/procure" className="hover:text-ink">Procure</Link> / Equipment Catalogue
        </div>
        <h1 className="t-display mt-2">Equipment Catalogue</h1>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search item or specs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-rule px-3 py-2 text-sm bg-white"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-meta py-6">No items.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Category</th>
                <th className="py-2 font-semibold">Item</th>
                <th className="py-2 font-semibold">Typical Specs</th>
                <th className="py-2 font-semibold">Rate Basis</th>
                <th className="py-2 font-semibold">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-rule">
                  <td className="py-3 text-xs uppercase tracking-wider text-meta">{i.category}</td>
                  <td className="py-3 text-xs font-semibold">{i.item_name}</td>
                  <td className="py-3 text-xs">{i.typical_specs ?? "—"}</td>
                  <td className="py-3 text-xs">{i.rate_basis}</td>
                  <td className="py-3 text-xs">{i.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SiteShell>
  );
}
