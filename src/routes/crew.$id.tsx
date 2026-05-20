import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useRole } from "@/hooks/use-role";
import { CrewFormDialog, type CrewRow } from "@/components/crew/CrewFormDialog";
import { TicketFormDialog, type TicketRow } from "@/components/crew/TicketFormDialog";
import { InductionFormDialog, inductionTone, toneClass, type InductionRow } from "@/components/sites/InductionFormDialog";
import { expiryLabel, expiryTone, daysUntil } from "@/lib/expiry";
import { toast } from "sonner";

export const Route = createFileRoute("/crew/$id")({
  head: () => ({ meta: [{ title: "Crew member — PACC HQ" }] }),
  component: CrewProfilePage,
});

function CrewProfilePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin, isCrew, isSupervisor, loading: roleLoading } = useRole();
  const [editCrewOpen, setEditCrewOpen] = useState(false);
  const [ticketDialog, setTicketDialog] = useState<{ open: boolean; ticket: TicketRow | null }>({ open: false, ticket: null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const { data: crew } = useQuery({
    queryKey: ["crew-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_members")
        .select("id, name, role, employment_type, phone, email, slack_user_id, project_id, default_supervisor_id, active, notes")
        .eq("id", id).maybeSingle();
      return data as (CrewRow & { notes: string | null }) | null;
    },
  });

  const { data: supervisor } = useQuery({
    queryKey: ["crew-supervisor", crew?.default_supervisor_id],
    enabled: !!crew?.default_supervisor_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("supervisors").select("id, name, email, slack_user_id")
        .eq("id", crew!.default_supervisor_id!).maybeSingle();
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from("crew_members").update({ active: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-detail", id] });
      qc.invalidateQueries({ queryKey: ["crew-list"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  if (!crew) {
    return (
      <SiteShell section="People">
        <p className="text-xs text-meta py-6">Loading…</p>
      </SiteShell>
    );
  }

  return (
    <SiteShell section="People">
      <div className="mb-2 t-eyebrow">
        <Link to="/crew" className="hover:text-ink">Crew</Link> / Profile
      </div>

      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="w-32 h-32 rounded-md bg-neutral-100 border border-rule flex items-center justify-center text-meta text-xs">
          Photo
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="t-display">{crew.name}</h1>
              <p className="text-sm text-meta mt-1">
                {crew.role || "—"}{crew.employment_type ? ` · ${crew.employment_type}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <label className="flex items-center gap-2 text-xs text-meta">
                    <Switch checked={crew.active !== false} onCheckedChange={(v) => toggleActive.mutate(!!v)} />
                    Active
                  </label>
                  <Button variant="outline" size="sm" onClick={() => setEditCrewOpen(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-4 text-xs">
            <Detail label="Phone" value={crew.phone} />
            <Detail label="Email" value={crew.email} />
            <div>
              <dt className="t-stat-label">Default supervisor</dt>
              <dd className="mt-1 text-xs">
                {supervisor ? (
                  <Popover>
                    <PopoverTrigger className="text-ink underline-offset-2 hover:underline">{supervisor.name}</PopoverTrigger>
                    <PopoverContent className="w-64 text-xs">
                      <p className="font-semibold">{supervisor.name}</p>
                      <p className="text-meta mt-1">Email: {supervisor.email ?? "—"}</p>
                      <p className="text-meta">Slack: {supervisor.slack_user_id ?? "—"}</p>
                    </PopoverContent>
                  </Popover>
                ) : <span className="text-meta">Unassigned</span>}
              </dd>
            </div>
            <Detail label="Status" value={crew.active === false ? "Inactive" : "Active"} />
          </dl>
        </div>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="inductions">Inductions</TabsTrigger>
          <TabsTrigger value="allocations">Allocation history</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-4">
          <TicketsTab
            personId={id}
            canEdit={isAdmin}
            onPreview={setPreviewUrl}
            onAdd={() => setTicketDialog({ open: true, ticket: null })}
            onRenew={(t) => setTicketDialog({ open: true, ticket: t })}
          />
        </TabsContent>

        <TabsContent value="inductions" className="mt-4">
          <p className="text-sm text-meta">Induction tracking arrives in Phase 3.</p>
        </TabsContent>

        <TabsContent value="allocations" className="mt-4">
          <AllocationsTab personId={id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesTab personId={id} initial={crew.notes ?? ""} canEdit={isAdmin} readOnly={isSupervisor} />
        </TabsContent>
      </Tabs>

      <CrewFormDialog open={editCrewOpen} onOpenChange={setEditCrewOpen} crew={crew} defaultProjectId={crew.project_id} />
      <TicketFormDialog
        open={ticketDialog.open}
        onOpenChange={(o) => setTicketDialog({ open: o, ticket: o ? ticketDialog.ticket : null })}
        personId={id}
        ticket={ticketDialog.ticket}
      />
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          {previewUrl && (
            previewUrl.match(/\.pdf(\?|$)/i)
              ? <iframe src={previewUrl} className="w-full h-[70vh]" title="Evidence" />
              : <img src={previewUrl} alt="Evidence" className="w-full max-h-[80vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </SiteShell>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="t-stat-label">{label}</dt>
      <dd className="mt-1">{value || <span className="text-meta">—</span>}</dd>
    </div>
  );
}

function TicketsTab({
  personId, canEdit, onAdd, onRenew, onPreview,
}: {
  personId: string;
  canEdit: boolean;
  onAdd: () => void;
  onRenew: (t: TicketRow) => void;
  onPreview: (url: string) => void;
}) {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["crew-tickets", personId],
    queryFn: async () => {
      const { data } = await supabase
        .from("person_competencies")
        .select("id, person_id, competency_id, issued_date, expiry_date, evidence_url, competencies(name, type, code)")
        .eq("person_id", personId)
        .order("issued_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Add ticket</Button>
        </div>
      )}
      {isLoading ? (
        <p className="text-xs text-meta">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-xs text-meta">No tickets recorded.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tickets.map((t) => <TicketCard key={t.id} t={t} canEdit={canEdit} onRenew={onRenew} onPreview={onPreview} />)}
        </div>
      )}
    </div>
  );
}

function TicketCard({ t, canEdit, onRenew, onPreview }: { t: any; canEdit: boolean; onRenew: (t: TicketRow) => void; onPreview: (url: string) => void }) {
  const tone = expiryTone(t.expiry_date);
  const toneClass = tone === "green"
    ? "bg-emerald-100 text-emerald-900 border-emerald-200"
    : tone === "amber"
    ? "bg-amber-100 text-amber-900 border-amber-200"
    : "bg-red-100 text-red-900 border-red-200";
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    if (!t.evidence_url) return;
    let active = true;
    supabase.storage.from("ticket-evidence").createSignedUrl(t.evidence_url, 600).then(({ data }) => {
      if (active && data) setThumbUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [t.evidence_url]);

  return (
    <div className="border border-rule rounded-md p-4 bg-white flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold leading-tight">{t.competencies?.name ?? "—"}</p>
          <p className="text-[10px] uppercase tracking-wider text-meta mt-0.5">{t.competencies?.code}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{t.competencies?.type ?? "—"}</Badge>
      </div>
      <div className="text-xs text-meta">
        Issued: {t.issued_date ?? "—"}<br />
        Expiry: {t.expiry_date ?? "No expiry"}
      </div>
      <Badge className={`${toneClass} self-start text-[10px]`}>{expiryLabel(t.expiry_date)}</Badge>
      {t.evidence_url && thumbUrl && (
        <button
          type="button"
          onClick={async () => {
            setLoadingUrl(true);
            const { data } = await supabase.storage.from("ticket-evidence").createSignedUrl(t.evidence_url, 600);
            setLoadingUrl(false);
            if (data) onPreview(data.signedUrl);
          }}
          className="mt-1 block w-full h-24 bg-neutral-50 border border-rule rounded overflow-hidden hover:opacity-90"
        >
          {/\.pdf(\?|$)/i.test(t.evidence_url) ? (
            <span className="flex items-center justify-center h-full text-xs text-meta">{loadingUrl ? "Opening…" : "View PDF evidence"}</span>
          ) : (
            <img src={thumbUrl} alt="Evidence" className="w-full h-full object-cover" />
          )}
        </button>
      )}
      {canEdit && (
        <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => onRenew(t)}>
          <RefreshCw className="h-3 w-3 mr-1" /> Renew
        </Button>
      )}
    </div>
  );
}

function AllocationsTab({ personId }: { personId: string }) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crew-allocations", personId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_allocations")
        .select("id, allocation_date, job_id, planned_hours, actual_hours, source, classification_id, projects(name), classifications(classification)")
        .eq("person_id", personId)
        .gte("allocation_date", since)
        .order("allocation_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  if (isLoading) return <p className="text-xs text-meta">Loading…</p>;
  if (rows.length === 0) return <p className="text-xs text-meta">No allocations in the last 90 days.</p>;

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="t-stat-label">
          <th className="py-2 font-semibold">Date</th>
          <th className="py-2 font-semibold">Project</th>
          <th className="py-2 font-semibold">Classification</th>
          <th className="py-2 font-semibold text-right">Planned</th>
          <th className="py-2 font-semibold text-right">Actual</th>
          <th className="py-2 font-semibold">Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-rule">
            <td className="py-2 text-xs">{r.allocation_date}</td>
            <td className="py-2 text-xs">{r.projects?.name ?? "—"}</td>
            <td className="py-2 text-xs">{r.classifications?.classification ?? "—"}</td>
            <td className="py-2 text-xs text-right tabular-nums">{r.planned_hours ?? "—"}</td>
            <td className="py-2 text-xs text-right tabular-nums">{r.actual_hours ?? "—"}</td>
            <td className="py-2 text-xs"><Badge variant="outline" className="text-[10px]">{r.source}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NotesTab({ personId, initial, canEdit, readOnly }: { personId: string; initial: string; canEdit: boolean; readOnly: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase.from("crew_members").update({ notes: next }).eq("id", personId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-detail", personId] });
      toast.success("Notes saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save notes"),
  });

  return (
    <Textarea
      rows={10}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (canEdit && value !== initial) save.mutate(value); }}
      disabled={!canEdit || readOnly}
      placeholder={canEdit ? "Notes about this crew member…" : "No notes."}
    />
  );
}

// silence unused warning if needed
void daysUntil;
