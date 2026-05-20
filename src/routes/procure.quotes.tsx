import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Inbox, RefreshCw, Download } from "lucide-react";

type QuoteRow = {
  id: string;
  supplier_id: string;
  subject: string | null;
  sender_email: string | null;
  received_at: string;
  body_text: string | null;
  body_snippet: string | null;
  attachment_paths: string[] | null;
  attachment_filenames: string[] | null;
  extracted_json: any;
  extracted_total: number | null;
  extraction_status: string;
  extraction_error: string | null;
  status: string;
  suppliers: { id: string; name: string } | null;
};

export const Route = createFileRoute("/procure/quotes")({
  head: () => ({ meta: [{ title: "Quotes — PACC HQ" }] }),
  component: QuotesPage,
});

function QuotesPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<QuoteRow | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["procure-quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("procure_quotes")
        .select("id, supplier_id, subject, sender_email, received_at, body_text, body_snippet, attachment_paths, attachment_filenames, extracted_json, extracted_total, extraction_status, extraction_error, status, suppliers ( id, name )")
        .order("received_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as QuoteRow[];
    },
  });

  const counts = useMemo(() => {
    const c = { new: 0, reviewed: 0, total: rows.length };
    for (const r of rows) if (r.status === "new") c.new++; else if (r.status === "reviewed") c.reviewed++;
    return c;
  }, [rows]);

  async function pollNow() {
    setPolling(true);
    try {
      const res = await fetch("/api/public/procure/poll-gmail", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Status ${res.status}`);
      toast.success(`Scanned ${json.scanned} · saved ${json.saved} new quote(s)`);
      qc.invalidateQueries({ queryKey: ["procure-quotes"] });
      qc.invalidateQueries({ queryKey: ["procure-quotes-new-count"] });
    } catch (e: any) {
      toast.error(`Poll failed: ${e?.message ?? e}`);
    } finally {
      setPolling(false);
    }
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("procure_quotes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procure-quotes"] });
      qc.invalidateQueries({ queryKey: ["procure-quotes-new-count"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  async function downloadAttachment(path: string, filename: string) {
    const { data, error } = await supabase.storage.from("procure-quotes").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("Could not generate download link"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <SiteShell section="Procure">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="t-eyebrow">
            <Link to="/procure" className="hover:text-ink">Procure</Link> / Quotes
          </div>
          <h1 className="t-display mt-2">Supplier Quotes</h1>
          <p className="t-lead mt-2">
            {counts.new} new · {counts.reviewed} reviewed · {counts.total} total
          </p>
        </div>
        <Button onClick={pollNow} disabled={polling} variant="outline" className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-1 ${polling ? "animate-spin" : ""}`} />
          {polling ? "Scanning…" : "Scan Gmail now"}
        </Button>
      </header>

      <div className="hairline pt-4">
        {isLoading ? (
          <p className="text-xs text-meta py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox className="h-8 w-8 text-meta mx-auto mb-3" />
            <p className="text-sm text-meta">No quotes yet.</p>
            <p className="text-xs text-meta mt-1">Click "Scan Gmail now" to pull supplier emails from your inbox.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="t-stat-label">
                <th className="py-2 font-semibold">Supplier</th>
                <th className="py-2 font-semibold">Subject</th>
                <th className="py-2 font-semibold">Received</th>
                <th className="py-2 font-semibold text-right">Total</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                    className="border-t border-rule cursor-pointer hover:bg-neutral-50"
                    onClick={() => setSelected(r)}>
                  <td className="py-3 text-xs font-semibold">{r.suppliers?.name ?? "—"}</td>
                  <td className="py-3 text-xs">{r.subject ?? "—"}</td>
                  <td className="py-3 text-xs">{new Date(r.received_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                  <td className="py-3 text-xs text-right">{r.extracted_total != null ? `$${r.extracted_total.toLocaleString()}` : "—"}</td>
                  <td className="py-3 text-xs"><StatusBadge status={r.status} extraction={r.extraction_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.subject ?? "Quote"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Field label="Supplier" value={selected.suppliers?.name ?? "—"} />
                  <Field label="From" value={selected.sender_email ?? "—"} />
                  <Field label="Received" value={new Date(selected.received_at).toLocaleString("en-AU")} />
                  <Field label="Status" value={<StatusBadge status={selected.status} extraction={selected.extraction_status} />} />
                </div>

                {selected.attachment_paths && selected.attachment_paths.length > 0 && (
                  <div>
                    <div className="t-eyebrow mb-2">Attachments</div>
                    <ul className="space-y-1.5">
                      {selected.attachment_paths.map((p, i) => (
                        <li key={p}>
                          <button
                            onClick={() => downloadAttachment(p, selected.attachment_filenames?.[i] ?? "quote.pdf")}
                            className="inline-flex items-center gap-1.5 text-xs text-[color:var(--brand)] hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {selected.attachment_filenames?.[i] ?? p.split("/").pop()}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <div className="t-eyebrow mb-2">AI extraction</div>
                  {selected.extraction_status === "pending" && <p className="text-xs text-meta">Pending…</p>}
                  {selected.extraction_status === "failed" && (
                    <p className="text-xs text-red-600">Failed: {selected.extraction_error}</p>
                  )}
                  {selected.extraction_status === "done" && selected.extracted_json && (
                    <ExtractedTable data={selected.extracted_json} />
                  )}
                </div>

                <div>
                  <div className="t-eyebrow mb-2">Email body</div>
                  <pre className="text-xs whitespace-pre-wrap font-sans bg-neutral-50 border border-rule rounded-md p-3 max-h-64 overflow-y-auto">
                    {selected.body_text || selected.body_snippet || "(empty)"}
                  </pre>
                </div>

                <div className="flex gap-2 pt-2">
                  {selected.status === "new" && (
                    <Button size="sm" onClick={() => statusMutation.mutate({ id: selected.id, status: "reviewed" })}>
                      Mark reviewed
                    </Button>
                  )}
                  {selected.status !== "archived" && (
                    <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: selected.id, status: "archived" })}>
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SiteShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-meta uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-ink">{value}</div>
    </div>
  );
}

function StatusBadge({ status, extraction }: { status: string; extraction: string }) {
  const tone =
    status === "new" ? "bg-red-100 text-red-700"
    : status === "reviewed" ? "bg-green-100 text-green-700"
    : status === "archived" ? "bg-neutral-100 text-neutral-600"
    : "bg-neutral-100 text-neutral-600";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${tone}`}>{status}</span>
      {extraction === "failed" && <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-amber-100 text-amber-700">AI failed</span>}
      {extraction === "pending" && <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-blue-100 text-blue-700">parsing</span>}
    </span>
  );
}

function ExtractedTable({ data }: { data: any }) {
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <table className="w-full text-xs border border-rule">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-1.5 px-2 text-left font-semibold">Description</th>
              <th className="py-1.5 px-2 text-right font-semibold">Qty</th>
              <th className="py-1.5 px-2 text-left font-semibold">Unit</th>
              <th className="py-1.5 px-2 text-right font-semibold">Unit $</th>
              <th className="py-1.5 px-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-1.5 px-2">{it.description ?? "—"}</td>
                <td className="py-1.5 px-2 text-right">{it.qty ?? "—"}</td>
                <td className="py-1.5 px-2">{it.unit ?? "—"}</td>
                <td className="py-1.5 px-2 text-right">{it.unit_price != null ? `$${Number(it.unit_price).toLocaleString()}` : "—"}</td>
                <td className="py-1.5 px-2 text-right">{it.total != null ? `$${Number(it.total).toLocaleString()}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-meta">No line items extracted.</p>
      )}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Field label="Subtotal" value={data?.subtotal != null ? `$${Number(data.subtotal).toLocaleString()}` : "—"} />
        <Field label="GST" value={data?.gst != null ? `$${Number(data.gst).toLocaleString()}` : "—"} />
        <Field label="Total" value={data?.total != null ? `$${Number(data.total).toLocaleString()}` : "—"} />
      </div>
      {data?.valid_until && <p className="text-xs text-meta">Valid until: {data.valid_until}</p>}
      {data?.notes && <p className="text-xs text-meta italic">{data.notes}</p>}
    </div>
  );
}
