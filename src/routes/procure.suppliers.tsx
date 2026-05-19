import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SupplierFormDialog, type SupplierRow } from "@/components/procure/SupplierFormDialog";

type SortDir = "asc" | "desc";
type SortKey = "name" | "contact_email" | "credit_terms_days" | "active";

export const Route = createFileRoute("/procure/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — PACC HQ" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, contact_name, contact_email, contact_phone, abn, credit_terms_days, payment_terms, fleet_notes, active");
      return (data ?? []) as SupplierRow[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? suppliers.filter((s) => s.name.toLowerCase().includes(q)) : suppliers;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      if (typeof av === "boolean" && typeof bv === "boolean") return Number(av) - Number(bv);
      return String(av).localeCompare(String(bv));
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [suppliers, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: SupplierRow) {
    setEditing(s);
    setDialogOpen(true);
  }

  return (
    <SiteShell section="Procure">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">
            <Link to="/procure" className="hover:text-ink">Procure</Link> / Suppliers
          </div>
          <h1 className="t-display mt-2">Suppliers</h1>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Supplier
        </Button>
      </header>

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-meta py-6">No suppliers yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <Th label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Contact Email" k="contact_email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Credit Terms (days)" k="credit_terms_days" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <Th label="Active" k="active" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                  onClick={() => openEdit(s)}
                >
                  <td className="py-3 text-xs font-semibold">{s.name}</td>
                  <td className="py-3 text-xs">{s.contact_email ?? "—"}</td>
                  <td className="py-3 text-xs text-right">{s.credit_terms_days ?? "—"}</td>
                  <td className="py-3 text-xs">{s.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editing} />
    </SiteShell>
  );
}

function Th({
  label, k, sortKey, sortDir, onSort, align,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; align?: "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 font-semibold ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`uppercase tracking-wider ${active ? "text-ink" : "text-meta hover:text-ink"}`}
      >
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
