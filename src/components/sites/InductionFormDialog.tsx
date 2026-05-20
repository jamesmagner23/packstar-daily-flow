import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyInductionBooked } from "@/lib/inductions.functions";

export type InductionRow = {
  id: string;
  person_id: string;
  site_id: string;
  status: string;
  booked_for_date: string | null;
  completed_date: string | null;
  expires_date: string | null;
  evidence_url: string | null;
};

const STATUSES = ["not_booked", "booked", "completed", "expired"] as const;
type Status = typeof STATUSES[number];

export function InductionFormDialog({
  open, onOpenChange, personId, siteId, induction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personId: string;
  siteId?: string | null;       // pre-selected (e.g. from crew matrix); empty for "add" on profile
  induction: InductionRow | null;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("not_booked");
  const [siteIdState, setSiteIdState] = useState<string>("");
  const [bookedFor, setBookedFor] = useState("");
  const [completed, setCompleted] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    if (induction) {
      setStatus(induction.status as Status);
      setSiteIdState(induction.site_id);
      setBookedFor(induction.booked_for_date ?? "");
      setCompleted(induction.completed_date ?? "");
      setExpires(induction.expires_date ?? "");
    } else {
      setStatus("not_booked");
      setSiteIdState(siteId ?? "");
      setBookedFor("");
      setCompleted("");
      setExpires("");
    }
    setFile(null);
  }, [open, induction, siteId]);

  const { data: sites = [] } = useQuery({
    queryKey: ["sites-picker"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const { data: person } = useQuery({
    queryKey: ["person-name", personId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("crew_members").select("id, name").eq("id", personId).maybeSingle();
      return data;
    },
  });

  const notifyBooked = useServerFn(notifyInductionBooked);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!siteIdState) throw new Error("Pick a site");

      let evidence_url: string | null = induction?.evidence_url ?? null;
      if (file) {
        const siteName = (sites as any[]).find((s) => s.id === siteIdState)?.name ?? "site";
        const safeSite = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const ext = file.name.split(".").pop() || "bin";
        const path = `${personId}/${safeSite}-${completed || new Date().toISOString().slice(0, 10)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("induction-evidence")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        evidence_url = path;
      }

      const payload: any = {
        person_id: personId,
        site_id: siteIdState,
        status,
        booked_for_date: bookedFor || null,
        completed_date: completed || null,
        expires_date: expires || null,
        evidence_url,
      };

      const prevStatus = induction?.status ?? "not_booked";
      const transitionedToBooked = status === "booked" && prevStatus !== "booked";

      if (induction) {
        const { error } = await supabase.from("person_inductions").update(payload).eq("id", induction.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("person_inductions").insert(payload);
        if (error) throw error;
      }

      if (transitionedToBooked && bookedFor) {
        try {
          await notifyBooked({
            data: {
              person_id: personId,
              site_id: siteIdState,
              booked_for_date: bookedFor,
            },
          });
        } catch (e) {
          console.error("[induction] booking DM failed", e);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-inductions"] });
      qc.invalidateQueries({ queryKey: ["site-crew-status"] });
      qc.invalidateQueries({ queryKey: ["sites-list"] });
      qc.invalidateQueries({ queryKey: ["crew-list"] });
      toast.success(induction ? "Induction updated" : "Induction added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {induction ? "Edit induction" : "Add induction"}{person?.name ? ` — ${person.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Site *" className="sm:col-span-2">
            <select
              className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={siteIdState}
              onChange={(e) => setSiteIdState(e.target.value)}
              disabled={!!induction || !!siteId}
            >
              <option value="">Select site</option>
              {(sites as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status *">
            <select
              className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Booked for">
            <Input type="date" value={bookedFor} onChange={(e) => setBookedFor(e.target.value)} />
          </Field>
          <Field label="Completed">
            <Input type="date" value={completed} onChange={(e) => setCompleted(e.target.value)} />
          </Field>
          <Field label="Expires">
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <Field label="Evidence (image or PDF)" className="sm:col-span-2">
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {induction?.evidence_url && !file && (
              <p className="text-xs text-meta mt-1">Existing file on record. Upload to replace.</p>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : induction ? "Save changes" : "Add induction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-wider text-meta">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function inductionTone(row: Pick<InductionRow, "status" | "expires_date">): {
  tone: "green" | "amber" | "red" | "grey";
  label: string;
} {
  if (!row.status || row.status === "not_booked") return { tone: "red", label: "Not booked" };
  if (row.status === "booked") return { tone: "amber", label: "Booked" };
  if (row.status === "expired") return { tone: "red", label: "Expired" };
  if (row.status === "completed") {
    if (row.expires_date) {
      const days = Math.round((new Date(row.expires_date).getTime() - Date.now()) / 86400000);
      if (days < 0) return { tone: "red", label: "Expired" };
      if (days <= 30) return { tone: "amber", label: `Expiring (${days}d)` };
      return { tone: "green", label: `Current (${days}d)` };
    }
    return { tone: "green", label: "Current" };
  }
  return { tone: "grey", label: row.status };
}

export function toneClass(tone: "green" | "amber" | "red" | "grey") {
  return tone === "green"
    ? "bg-emerald-100 text-emerald-900 border-emerald-200"
    : tone === "amber"
    ? "bg-amber-100 text-amber-900 border-amber-200"
    : tone === "red"
    ? "bg-red-100 text-red-900 border-red-200"
    : "bg-neutral-100 text-neutral-700 border-neutral-200";
}
